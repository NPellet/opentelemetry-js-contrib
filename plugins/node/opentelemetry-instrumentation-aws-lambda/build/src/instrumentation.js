"use strict";
/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AwsLambdaInstrumentation = exports.traceContextEnvironmentKey = exports.contextGetter = void 0;
const path = require("path");
const instrumentation_1 = require("@opentelemetry/instrumentation");
const api_1 = require("@opentelemetry/api");
const propagator_aws_xray_1 = require("@opentelemetry/propagator-aws-xray");
const semantic_conventions_1 = require("@opentelemetry/semantic-conventions");
const version_1 = require("./version");
const assert_1 = require("assert");
const propagation_utils_1 = require("@opentelemetry/propagation-utils");
class ContextGetter {
    keys(carrier) {
        return Object.keys(carrier);
    }
    get(carrier, key) {
        var _a, _b;
        if (typeof (carrier === null || carrier === void 0 ? void 0 : carrier[key]) == 'object') {
            return ((_a = carrier === null || carrier === void 0 ? void 0 : carrier[key]) === null || _a === void 0 ? void 0 : _a.stringValue) || ((_b = carrier === null || carrier === void 0 ? void 0 : carrier[key]) === null || _b === void 0 ? void 0 : _b.value);
        }
        else {
            return carrier === null || carrier === void 0 ? void 0 : carrier[key];
        }
    }
}
const extractPropagationContext = (message, sqsExtractContextPropagationFromPayload) => {
    const propagationFields = api_1.propagation.fields();
    if (message.attributes &&
        Object.keys(message.attributes).some((attr) => propagationFields.includes(attr))) {
        return message.attributes;
    }
    else if (message.messageAttributes &&
        Object.keys(message.messageAttributes).some((attr) => propagationFields.includes(attr))) {
        return message.messageAttributes;
    }
    else if (sqsExtractContextPropagationFromPayload && message.body) {
        try {
            const payload = JSON.parse(message.body);
            return payload.messageAttributes;
        }
        catch (_a) {
            api_1.diag.debug('failed to parse SQS payload to extract context propagation, trace might be incomplete.');
        }
    }
    return undefined;
};
exports.contextGetter = new ContextGetter();
const awsPropagator = new propagator_aws_xray_1.AWSXRayPropagator();
const headerGetter = {
    keys(carrier) {
        return Object.keys(carrier);
    },
    get(carrier, key) {
        return carrier[key];
    },
};
exports.traceContextEnvironmentKey = '_X_AMZN_TRACE_ID';
class AwsLambdaInstrumentation extends instrumentation_1.InstrumentationBase {
    constructor(_config = {}) {
        super('@opentelemetry/instrumentation-aws-lambda', version_1.VERSION, _config);
        this._config = _config;
    }
    setConfig(config = {}) {
        this._config = config;
    }
    init() {
        const taskRoot = process.env.LAMBDA_TASK_ROOT;
        const handlerDef = process.env._HANDLER;
        // _HANDLER and LAMBDA_TASK_ROOT are always defined in Lambda but guard bail out if in the future this changes.
        if (!taskRoot || !handlerDef) {
            return [];
        }
        const handler = path.basename(handlerDef);
        const moduleRoot = handlerDef.substr(0, handlerDef.length - handler.length);
        const [module, functionName] = handler.split('.', 2);
        // Lambda loads user function using an absolute path.
        let filename = path.resolve(taskRoot, moduleRoot, module);
        if (!filename.endsWith('.js')) {
            // Patching infrastructure currently requires a filename when requiring with an absolute path.
            filename += '.js';
        }
        return [
            new instrumentation_1.InstrumentationNodeModuleDefinition(
            // NB: The patching infrastructure seems to match names backwards, this must be the filename, while
            // InstrumentationNodeModuleFile must be the module name.
            filename, ['*'], undefined, undefined, [
                new instrumentation_1.InstrumentationNodeModuleFile(module, ['*'], (moduleExports) => {
                    api_1.diag.debug('Applying patch for lambda handler');
                    if (instrumentation_1.isWrapped(moduleExports[functionName])) {
                        this._unwrap(moduleExports, functionName);
                    }
                    this._wrap(moduleExports, functionName, this._getHandler());
                    return moduleExports;
                }, (moduleExports) => {
                    if (moduleExports == undefined)
                        return;
                    api_1.diag.debug('Removing patch for lambda handler');
                    this._unwrap(moduleExports, functionName);
                }),
            ]),
        ];
    }
    _getHandler() {
        return (original) => {
            return this._getPatchHandler(original);
        };
    }
    _getPatchHandler(original) {
        api_1.diag.debug('patch handler function');
        const plugin = this;
        return function patchedHandler(
        // The event can be a user type, it truly is any.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        event, context, callback) {
            var _a;
            const config = plugin._config;
            const parent = AwsLambdaInstrumentation._determineParent(event, context, config.disableAwsContextPropagation === true, config.eventContextExtractor ||
                AwsLambdaInstrumentation._defaultEventContextExtractor);
            const name = context.functionName;
            let wrapperSpan;
            if (((_a = plugin._config.detectApiGateway) === null || _a === void 0 ? void 0 : _a.enable) && event.requestContext) {
                plugin.triggerOrigin = 0 /* API_GATEWAY */;
                wrapperSpan = plugin._getApiGatewaySpan(event, parent);
            }
            const inner = (otelContextInstance) => {
                const lambdaSpan = plugin.tracer.startSpan(name, {
                    kind: api_1.SpanKind.SERVER,
                    attributes: {
                        [semantic_conventions_1.SemanticAttributes.FAAS_EXECUTION]: context.awsRequestId,
                        [semantic_conventions_1.SemanticResourceAttributes.FAAS_ID]: context.invokedFunctionArn,
                        [semantic_conventions_1.SemanticResourceAttributes.CLOUD_ACCOUNT_ID]: AwsLambdaInstrumentation._extractAccountId(context.invokedFunctionArn),
                    },
                }, otelContextInstance);
                if (config.requestHook) {
                    instrumentation_1.safeExecuteInTheMiddle(() => config.requestHook(lambdaSpan, { event, context }), (e) => {
                        if (e)
                            api_1.diag.error('aws-lambda instrumentation: requestHook error', e);
                    }, true);
                }
                return api_1.context.with(api_1.trace.setSpan(otelContextInstance, lambdaSpan), () => {
                    /**
         * If there is a "Records" entry in the event that is of Array type, we might assume we are receiving a list of records coming from a queue, like SQS.
         * We will patch those items following the aws-sdk implementation
         */
                    if ('Records' in event) {
                        propagation_utils_1.pubsubPropagation.patchMessagesArrayToStartProcessSpans({
                            messages: event.Records,
                            parentContext: api_1.trace.setSpan(api_1.context.active(), lambdaSpan),
                            tracer: plugin.tracer,
                            messageToSpanDetails: (message) => {
                                console.log(api_1.propagation.extract(api_1.ROOT_CONTEXT, extractPropagationContext(message, false), exports.contextGetter));
                                return {
                                    name: 'SQS',
                                    parentContext: api_1.propagation.extract(api_1.ROOT_CONTEXT, extractPropagationContext(message, false), exports.contextGetter),
                                    attributes: {
                                        [semantic_conventions_1.SemanticAttributes.MESSAGING_SYSTEM]: 'aws.sqs',
                                        [semantic_conventions_1.SemanticAttributes.MESSAGING_DESTINATION_KIND]: semantic_conventions_1.MessagingDestinationKindValues.QUEUE,
                                        [semantic_conventions_1.SemanticAttributes.MESSAGING_MESSAGE_ID]: message.messageId,
                                        [semantic_conventions_1.SemanticAttributes.MESSAGING_OPERATION]: semantic_conventions_1.MessagingOperationValues.PROCESS,
                                    },
                                };
                            },
                        });
                        propagation_utils_1.pubsubPropagation.patchArrayForProcessSpans(event.Records, plugin.tracer, api_1.context.active());
                    }
                    // Lambda seems to pass a callback even if handler is of Promise form, so we wrap all the time before calling
                    // the handler and see if the result is a Promise or not. In such a case, the callback is usually ignored. If
                    // the handler happened to both call the callback and complete a returned Promise, whichever happens first will
                    // win and the latter will be ignored.
                    const wrappedCallback = plugin._wrapCallback(callback, lambdaSpan, wrapperSpan);
                    const maybePromise = instrumentation_1.safeExecuteInTheMiddle(() => original.apply(this, [event, context, wrappedCallback]), (error) => {
                        if (error != null) {
                            // Exception thrown synchronously before resolving callback / promise.
                            // Callback may or may not have been called, we can't know for sure, but it doesn't matter, both will end the current span
                            plugin._applyResponseHook(lambdaSpan, error);
                            plugin._endSpan(lambdaSpan, error);
                        }
                    });
                    if (typeof (maybePromise === null || maybePromise === void 0 ? void 0 : maybePromise.then) === 'function') {
                        return maybePromise.then((value) => {
                            plugin._applyResponseHook(lambdaSpan, null, value);
                            plugin._endSpan(lambdaSpan, undefined);
                            return value;
                        }, (err) => {
                            plugin._applyResponseHook(lambdaSpan, err);
                            plugin._endSpan(lambdaSpan, err);
                            throw err;
                        });
                    }
                    return maybePromise;
                });
            };
            let handlerReturn;
            if (!wrapperSpan) {
                // No wrapper span
                try {
                    handlerReturn = inner(parent);
                }
                catch (e) {
                    // Catching a lambda that synchronously failed
                    plugin._flush();
                    throw e;
                }
            }
            else {
                const subCtx = api_1.trace.setSpan(parent, wrapperSpan);
                handlerReturn = api_1.context.with(subCtx, () => {
                    return instrumentation_1.safeExecuteInTheMiddle(() => {
                        const innerResult = inner(subCtx); // This call never fails, because it either returns a promise, or was called with safeExecuteInTheMiddle
                        // The handler was an async, it returned a promise.
                        if (typeof (innerResult === null || innerResult === void 0 ? void 0 : innerResult.then) === 'function') {
                            return innerResult.then((value) => {
                                assert_1.strict(wrapperSpan);
                                plugin._endWrapperSpan(wrapperSpan, value, undefined);
                                return value;
                            }, async (error) => {
                                assert_1.strict(wrapperSpan);
                                await plugin._endWrapperSpan(wrapperSpan, undefined, error);
                                throw error; // We don't want the instrumentation to hide the error from AWS
                            });
                        }
                        else {
                            // The lambda was synchronous, or it as synchronously thrown an error
                            assert_1.strict(wrapperSpan);
                            //if (hasLambdaSynchronouslyThrown) {
                            plugin._endWrapperSpan(wrapperSpan, innerResult, undefined);
                            // }
                            // Fallthrough: sync reply, but callback may be in use. No way to query the event loop !
                        }
                        return innerResult;
                    }, (error) => {
                        if (error) {
                            assert_1.strict(wrapperSpan);
                            plugin._endWrapperSpan(wrapperSpan, undefined, error);
                            plugin._flush();
                        }
                    });
                });
            }
            // Second case, lambda was asynchronous, in which case
            if (typeof (handlerReturn === null || handlerReturn === void 0 ? void 0 : handlerReturn.then) === 'function') {
                return handlerReturn.then(async (success) => {
                    await plugin._flush();
                    return success;
                }, async (error) => {
                    await plugin._flush();
                    throw error;
                });
            }
            // Third case, the lambda is purely synchronous, without event loop, nor callback() being called
            // Pitfall, no flushing !
            // We can't know for sure if the event loop is empty or not, so we can't know if we should flush or not.
            return handlerReturn;
        };
    }
    _getApiGatewaySpan(event, parent) {
        var _a;
        const requestContext = event.requestContext;
        let attributes = {
            [semantic_conventions_1.SemanticAttributes.HTTP_METHOD]: requestContext.httpMethod,
            [semantic_conventions_1.SemanticAttributes.HTTP_ROUTE]: requestContext.resourcePath,
            [semantic_conventions_1.SemanticAttributes.HTTP_URL]: requestContext.domainName + requestContext.path,
            [semantic_conventions_1.SemanticAttributes.HTTP_SERVER_NAME]: requestContext.domainName,
            [semantic_conventions_1.SemanticResourceAttributes.CLOUD_ACCOUNT_ID]: requestContext.accountId,
        };
        if ((_a = requestContext.identity) === null || _a === void 0 ? void 0 : _a.sourceIp) {
            attributes[semantic_conventions_1.SemanticAttributes.NET_PEER_IP] =
                requestContext.identity.sourceIp;
        }
        if (event.multiValueQueryStringParameters) {
            Object.assign(attributes, Object.fromEntries(Object.entries(event.multiValueQueryStringParameters).map(([k, v]) => [`http.request.query.${k}`, v.length == 1 ? v[0] : v] // We don't have a semantic attribute for query parameters, but would be useful nonetheless
            )));
        }
        if (event.multiValueHeaders) {
            Object.assign(attributes, Object.fromEntries(Object.entries(event.multiValueHeaders).map(([k, v]) => [
                // See https://opentelemetry.io/docs/reference/specification/trace/semantic_conventions/http/#http-request-and-response-headers
                `http.request.header.${k}`,
                v.length == 1 ? v[0] : v,
            ])));
        }
        if (event.pathParameters) {
            Object.assign(attributes, Object.fromEntries(Object.entries(event.pathParameters).map(([k, v]) => [
                `http.request.parameters.${k}`,
                v,
            ])));
        }
        return this.tracer.startSpan(requestContext.domainName + requestContext.path, {
            kind: api_1.SpanKind.SERVER,
            attributes: attributes,
        }, parent);
    }
    setTracerProvider(tracerProvider) {
        super.setTracerProvider(tracerProvider);
        this._forceFlush = this._getForceFlush(tracerProvider);
    }
    async _endWrapperSpan(span, returnFromLambda, errorFromLambda) {
        if (this.triggerOrigin == 0 /* API_GATEWAY */) {
            this._endAPIGatewaySpan(span, returnFromLambda, errorFromLambda);
        }
        span.end();
    }
    _endAPIGatewaySpan(span, returnFromLambda, errorFromLambda) {
        var _a;
        if (errorFromLambda) {
            span.recordException(errorFromLambda);
            span.setStatus({
                code: api_1.SpanStatusCode.ERROR,
                message: this._errorToString(errorFromLambda),
            });
            span.end();
            return;
        }
        if (!(typeof returnFromLambda == 'object')) {
            span.setStatus({
                code: api_1.SpanStatusCode.ERROR,
                message: 'Lambda return value malformed',
            });
            span.end();
            return;
        }
        span.setAttribute(semantic_conventions_1.SemanticAttributes.HTTP_STATUS_CODE, returnFromLambda.statusCode);
        const statusCode = returnFromLambda.statusCode;
        if ((_a = this._config.detectApiGateway) === null || _a === void 0 ? void 0 : _a.errorCodes) {
            const fail = this._config.detectApiGateway.errorCodes.reduce((fail, ec) => {
                if (fail || ec === statusCode) {
                    return true;
                }
                if (ec instanceof RegExp && ec.test(String(statusCode))) {
                    return true;
                }
                return fail;
            }, false);
            if (fail) {
                return span.setStatus({
                    code: api_1.SpanStatusCode.ERROR,
                    message: 'Return to API Gateway with error ' + returnFromLambda.statusCode,
                });
            }
            else {
                return span.setStatus({
                    code: api_1.SpanStatusCode.OK,
                });
            }
        }
        return span.setStatus({
            code: api_1.SpanStatusCode.UNSET,
        });
    }
    _getForceFlush(tracerProvider) {
        if (!tracerProvider)
            return undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let currentProvider = tracerProvider;
        if (typeof currentProvider.getDelegate === 'function') {
            currentProvider = currentProvider.getDelegate();
        }
        if (typeof currentProvider.forceFlush === 'function') {
            return currentProvider.forceFlush.bind(currentProvider);
        }
        return undefined;
    }
    _wrapCallback(originalAWSLambdaCallback, span, wrapperSpan) {
        const plugin = this;
        return (err, res) => {
            api_1.diag.debug('executing wrapped lookup callback function');
            plugin._applyResponseHook(span, err, res);
            plugin._endSpan(span, err);
            if (wrapperSpan) {
                plugin._endWrapperSpan(wrapperSpan, res, err);
            }
            this._flush().then(() => {
                api_1.diag.debug('executing original lookup callback function');
                originalAWSLambdaCallback.apply(this, [err, res]); // End of the function
            });
        };
    }
    async _flush() {
        if (this._forceFlush) {
            try {
                await this._forceFlush();
            }
            catch (e) {
                // We must not fail this call, but we may log it
                api_1.diag.error('Error while flushing the lambda', e);
            }
        }
        else {
            api_1.diag.error('Spans may not be exported for the lambda function because we are not force flushing before callback.');
        }
    }
    _endSpan(span, err) {
        if (err) {
            span.recordException(err);
        }
        const errMessage = this._errorToString(err);
        if (errMessage) {
            span.setStatus({
                code: api_1.SpanStatusCode.ERROR,
                message: errMessage,
            });
        }
        span.end();
    }
    _errorToString(err) {
        let errMessage;
        if (typeof err === 'string') {
            errMessage = err;
        }
        else if (err) {
            errMessage = err.message;
        }
        return errMessage;
    }
    _applyResponseHook(span, err, res) {
        var _a;
        if ((_a = this._config) === null || _a === void 0 ? void 0 : _a.responseHook) {
            instrumentation_1.safeExecuteInTheMiddle(() => this._config.responseHook(span, { err, res }), (e) => {
                if (e)
                    api_1.diag.error('aws-lambda instrumentation: responseHook error', e);
            }, true);
        }
    }
    static _extractAccountId(arn) {
        const parts = arn.split(':');
        if (parts.length >= 5) {
            return parts[4];
        }
        return undefined;
    }
    static _defaultEventContextExtractor(event) {
        // The default extractor tries to get sampled trace header from HTTP headers.
        const httpHeaders = event.headers || {};
        return api_1.propagation.extract(api_1.context.active(), httpHeaders, headerGetter);
    }
    static _determineParent(event, context, disableAwsContextPropagation, eventContextExtractor) {
        var _a, _b;
        let parent = undefined;
        if (!disableAwsContextPropagation) {
            const lambdaTraceHeader = process.env[exports.traceContextEnvironmentKey];
            if (lambdaTraceHeader) {
                parent = awsPropagator.extract(api_1.context.active(), { [propagator_aws_xray_1.AWSXRAY_TRACE_ID_HEADER]: lambdaTraceHeader }, headerGetter);
            }
            if (parent) {
                const spanContext = (_a = api_1.trace.getSpan(parent)) === null || _a === void 0 ? void 0 : _a.spanContext();
                if (spanContext &&
                    (spanContext.traceFlags & api_1.TraceFlags.SAMPLED) === api_1.TraceFlags.SAMPLED) {
                    // Trace header provided by Lambda only sampled if a sampled context was propagated from
                    // an upstream cloud service such as S3, or the user is using X-Ray. In these cases, we
                    // need to use it as the parent.
                    return parent;
                }
            }
        }
        const extractedContext = instrumentation_1.safeExecuteInTheMiddle(() => eventContextExtractor(event, context), (e) => {
            if (e)
                api_1.diag.error('aws-lambda instrumentation: eventContextExtractor error', e);
        }, true);
        if ((_b = api_1.trace.getSpan(extractedContext)) === null || _b === void 0 ? void 0 : _b.spanContext()) {
            return extractedContext;
        }
        if (!parent) {
            // No context in Lambda environment or HTTP headers.
            return api_1.ROOT_CONTEXT;
        }
        return parent;
    }
}
exports.AwsLambdaInstrumentation = AwsLambdaInstrumentation;
//# sourceMappingURL=instrumentation.js.map