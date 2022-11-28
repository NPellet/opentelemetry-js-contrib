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
exports.assertSpanFailure = exports.assertSpanSuccess = void 0;
// We access through node_modules to allow it to be patched.
/* eslint-disable node/no-extraneous-require */
const path = require("path");
const src_1 = require("../../src");
const sdk_trace_base_1 = require("@opentelemetry/sdk-trace-base");
const sdk_trace_node_1 = require("@opentelemetry/sdk-trace-node");
const assert = require("assert");
const semantic_conventions_1 = require("@opentelemetry/semantic-conventions");
const api_1 = require("@opentelemetry/api");
const propagator_aws_xray_1 = require("@opentelemetry/propagator-aws-xray");
const core_1 = require("@opentelemetry/core");
const memoryExporter = new sdk_trace_base_1.InMemorySpanExporter();
const provider = new sdk_trace_node_1.NodeTracerProvider();
provider.addSpanProcessor(new sdk_trace_base_1.BatchSpanProcessor(memoryExporter));
provider.register();
const assertSpanSuccess = (span) => {
    assert.strictEqual(span.kind, api_1.SpanKind.SERVER);
    assert.strictEqual(span.name, 'my_function');
    assert.strictEqual(span.attributes[semantic_conventions_1.SemanticAttributes.FAAS_EXECUTION], 'aws_request_id');
    assert.strictEqual(span.attributes['faas.id'], 'my_arn');
    assert.strictEqual(span.status.code, api_1.SpanStatusCode.UNSET);
    assert.strictEqual(span.status.message, undefined);
};
exports.assertSpanSuccess = assertSpanSuccess;
const assertSpanFailure = (span) => {
    assert.strictEqual(span.kind, api_1.SpanKind.SERVER);
    assert.strictEqual(span.name, 'my_function');
    assert.strictEqual(span.attributes[semantic_conventions_1.SemanticAttributes.FAAS_EXECUTION], 'aws_request_id');
    assert.strictEqual(span.attributes['faas.id'], 'my_arn');
    assert.strictEqual(span.status.code, api_1.SpanStatusCode.ERROR);
    assert.strictEqual(span.status.message, 'handler error');
    assert.strictEqual(span.events.length, 1);
    assert.strictEqual(span.events[0].attributes[semantic_conventions_1.SemanticAttributes.EXCEPTION_MESSAGE], 'handler error');
};
exports.assertSpanFailure = assertSpanFailure;
const serializeSpanContext = (spanContext, propagator) => {
    let serialized = '';
    propagator.inject(api_1.trace.setSpan(api_1.context.active(), api_1.trace.wrapSpanContext(spanContext)), {}, {
        set(carrier, key, value) {
            serialized = value;
        },
    });
    return serialized;
};
describe('lambda handler', () => {
    let instrumentation;
    let oldEnv;
    const ctx = {
        functionName: 'my_function',
        invokedFunctionArn: 'my_arn',
        awsRequestId: 'aws_request_id',
    };
    const initializeHandler = (handler, config = {}) => {
        process.env._HANDLER = handler;
        instrumentation = new src_1.AwsLambdaInstrumentation(config);
        instrumentation.setTracerProvider(provider);
    };
    const lambdaRequire = (module) => require(path.resolve(__dirname, '..', module));
    const sampledAwsSpanContext = {
        traceId: '8a3c60f7d188f8fa79d48a391a778fa6',
        spanId: '0000000000000456',
        traceFlags: 1,
        isRemote: true,
    };
    const sampledAwsHeader = serializeSpanContext(sampledAwsSpanContext, new propagator_aws_xray_1.AWSXRayPropagator());
    const sampledHttpSpanContext = {
        traceId: '8a3c60f7d188f8fa79d48a391a778fa7',
        spanId: '0000000000000457',
        traceFlags: 1,
        isRemote: true,
    };
    const sampledHttpHeader = serializeSpanContext(sampledHttpSpanContext, new core_1.W3CTraceContextPropagator());
    const unsampledAwsSpanContext = {
        traceId: '8a3c60f7d188f8fa79d48a391a778fa8',
        spanId: '0000000000000458',
        traceFlags: 0,
        isRemote: true,
    };
    const unsampledAwsHeader = serializeSpanContext(unsampledAwsSpanContext, new propagator_aws_xray_1.AWSXRayPropagator());
    const unsampledHttpSpanContext = {
        traceId: '8a3c60f7d188f8fa79d48a391a778fa9',
        spanId: '0000000000000459',
        traceFlags: 0,
        isRemote: true,
    };
    const unsampledHttpHeader = serializeSpanContext(unsampledHttpSpanContext, new core_1.W3CTraceContextPropagator());
    const sampledGenericSpanContext = {
        traceId: '8a3c60f7d188f8fa79d48a391a778faa',
        spanId: '0000000000000460',
        traceFlags: 1,
        isRemote: true,
    };
    const sampledGenericSpan = serializeSpanContext(sampledGenericSpanContext, new core_1.W3CTraceContextPropagator());
    beforeEach(() => {
        oldEnv = Object.assign({}, process.env);
        process.env.LAMBDA_TASK_ROOT = path.resolve(__dirname, '..');
    });
    afterEach(() => {
        process.env = oldEnv;
        instrumentation.disable();
        memoryExporter.reset();
    });
    describe('async success handler', () => {
        it('should export a valid span', async () => {
            initializeHandler('lambda-test/async.handler');
            const result = await lambdaRequire('lambda-test/async').handler('arg', ctx);
            assert.strictEqual(result, 'ok');
            const spans = memoryExporter.getFinishedSpans();
            const [span] = spans;
            assert.strictEqual(spans.length, 1);
            exports.assertSpanSuccess(span);
            assert.strictEqual(span.parentSpanId, undefined);
        });
        it('should record error', async () => {
            initializeHandler('lambda-test/async.error');
            let err;
            try {
                await lambdaRequire('lambda-test/async').error('arg', ctx);
            }
            catch (e) {
                err = e;
            }
            assert.strictEqual(err.message, 'handler error');
            const spans = memoryExporter.getFinishedSpans();
            const [span] = spans;
            assert.strictEqual(spans.length, 1);
            exports.assertSpanFailure(span);
            assert.strictEqual(span.parentSpanId, undefined);
        });
        it('should record string error', async () => {
            initializeHandler('lambda-test/async.stringerror');
            let err;
            try {
                await lambdaRequire('lambda-test/async').stringerror('arg', ctx);
            }
            catch (e) {
                err = e;
            }
            assert.strictEqual(err, 'handler error');
            const spans = memoryExporter.getFinishedSpans();
            const [span] = spans;
            exports.assertSpanFailure(span);
            assert.strictEqual(span.parentSpanId, undefined);
        });
        it('context should have parent trace', async () => {
            initializeHandler('lambda-test/async.context');
            const result = await lambdaRequire('lambda-test/async').context('arg', ctx);
            const spans = memoryExporter.getFinishedSpans();
            const [span] = spans;
            assert.strictEqual(span.spanContext().traceId, result);
        });
        it('context should have parent trace', async () => {
            initializeHandler('lambda-test/async.context');
            const result = await lambdaRequire('lambda-test/async').context('arg', ctx);
            const spans = memoryExporter.getFinishedSpans();
            const [span] = spans;
            assert.strictEqual(span.spanContext().traceId, result);
        });
    });
    describe('sync success handler', () => {
        it('should export a valid span', async () => {
            initializeHandler('lambda-test/sync.handler');
            const result = await new Promise((resolve, reject) => {
                lambdaRequire('lambda-test/sync').handler('arg', ctx, (err, res) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve(res);
                    }
                });
            });
            assert.strictEqual(result, 'ok');
            const spans = memoryExporter.getFinishedSpans();
            const [span] = spans;
            assert.strictEqual(spans.length, 1);
            exports.assertSpanSuccess(span);
            assert.strictEqual(span.parentSpanId, undefined);
        });
        it('should record error', async () => {
            initializeHandler('lambda-test/sync.error');
            let err;
            try {
                lambdaRequire('lambda-test/sync').error('arg', ctx, (err, res) => { });
            }
            catch (e) {
                err = e;
            }
            assert.strictEqual(err.message, 'handler error');
            const spans = memoryExporter.getFinishedSpans();
            const [span] = spans;
            assert.strictEqual(spans.length, 1);
            exports.assertSpanFailure(span);
            assert.strictEqual(span.parentSpanId, undefined);
        });
        it('should record error in callback', async () => {
            initializeHandler('lambda-test/sync.callbackerror');
            let err;
            try {
                await new Promise((resolve, reject) => {
                    lambdaRequire('lambda-test/sync').callbackerror('arg', ctx, (err, res) => {
                        if (err) {
                            reject(err);
                        }
                        else {
                            resolve(res);
                        }
                    });
                });
            }
            catch (e) {
                err = e;
            }
            assert.strictEqual(err.message, 'handler error');
            const spans = memoryExporter.getFinishedSpans();
            const [span] = spans;
            assert.strictEqual(spans.length, 1);
            exports.assertSpanFailure(span);
            assert.strictEqual(span.parentSpanId, undefined);
        });
        it('should record string error', async () => {
            initializeHandler('lambda-test/sync.stringerror');
            let err;
            try {
                lambdaRequire('lambda-test/sync').stringerror('arg', ctx, (err, res) => { });
            }
            catch (e) {
                err = e;
            }
            assert.strictEqual(err, 'handler error');
            const spans = memoryExporter.getFinishedSpans();
            const [span] = spans;
            assert.strictEqual(spans.length, 1);
            exports.assertSpanFailure(span);
            assert.strictEqual(span.parentSpanId, undefined);
        });
        it('context should have parent trace', async () => {
            initializeHandler('lambda-test/sync.context');
            const result = await new Promise((resolve, reject) => {
                lambdaRequire('lambda-test/sync').context('arg', ctx, (err, res) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve(res);
                    }
                });
            });
            const spans = memoryExporter.getFinishedSpans();
            const [span] = spans;
            assert.strictEqual(span.spanContext().traceId, result);
        });
        it('context should have parent trace', async () => {
            initializeHandler('lambda-test/sync.context');
            const result = await new Promise((resolve, reject) => {
                lambdaRequire('lambda-test/sync').context('arg', ctx, (err, res) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve(res);
                    }
                });
            });
            const spans = memoryExporter.getFinishedSpans();
            const [span] = spans;
            assert.strictEqual(span.spanContext().traceId, result);
        });
    });
    it('should record string error in callback', async () => {
        initializeHandler('lambda-test/sync.callbackstringerror');
        let err;
        try {
            await new Promise((resolve, reject) => {
                lambdaRequire('lambda-test/sync').callbackstringerror('arg', ctx, (err, res) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve(res);
                    }
                });
            });
        }
        catch (e) {
            err = e;
        }
        assert.strictEqual(err, 'handler error');
        const spans = memoryExporter.getFinishedSpans();
        const [span] = spans;
        assert.strictEqual(spans.length, 1);
        exports.assertSpanFailure(span);
        assert.strictEqual(span.parentSpanId, undefined);
    });
    describe('with remote parent', () => {
        it('uses lambda context if sampled and no http context', async () => {
            process.env[src_1.traceContextEnvironmentKey] = sampledAwsHeader;
            initializeHandler('lambda-test/async.handler');
            const result = await lambdaRequire('lambda-test/async').handler('arg', ctx);
            assert.strictEqual(result, 'ok');
            const spans = memoryExporter.getFinishedSpans();
            const [span] = spans;
            assert.strictEqual(spans.length, 1);
            exports.assertSpanSuccess(span);
            assert.strictEqual(span.spanContext().traceId, sampledAwsSpanContext.traceId);
            assert.strictEqual(span.parentSpanId, sampledAwsSpanContext.spanId);
        });
        it('uses lambda context if unsampled and no http context', async () => {
            process.env[src_1.traceContextEnvironmentKey] = unsampledAwsHeader;
            initializeHandler('lambda-test/async.handler');
            const result = await lambdaRequire('lambda-test/async').handler('arg', ctx);
            assert.strictEqual(result, 'ok');
            const spans = memoryExporter.getFinishedSpans();
            // Parent unsampled so no exported spans.
            assert.strictEqual(spans.length, 0);
        });
        it('uses lambda context if sampled and http context present', async () => {
            process.env[src_1.traceContextEnvironmentKey] = sampledAwsHeader;
            initializeHandler('lambda-test/async.handler');
            const proxyEvent = {
                headers: {
                    traceparent: sampledHttpHeader,
                },
            };
            const result = await lambdaRequire('lambda-test/async').handler(proxyEvent, ctx);
            assert.strictEqual(result, 'ok');
            const spans = memoryExporter.getFinishedSpans();
            const [span] = spans;
            assert.strictEqual(spans.length, 1);
            exports.assertSpanSuccess(span);
            assert.strictEqual(span.spanContext().traceId, sampledAwsSpanContext.traceId);
            assert.strictEqual(span.parentSpanId, sampledAwsSpanContext.spanId);
        });
        it('uses http context if sampled and lambda context unsampled', async () => {
            process.env[src_1.traceContextEnvironmentKey] = unsampledAwsHeader;
            initializeHandler('lambda-test/async.handler');
            const proxyEvent = {
                headers: {
                    traceparent: sampledHttpHeader,
                },
            };
            const result = await lambdaRequire('lambda-test/async').handler(proxyEvent, ctx);
            assert.strictEqual(result, 'ok');
            const spans = memoryExporter.getFinishedSpans();
            const [span] = spans;
            assert.strictEqual(spans.length, 1);
            exports.assertSpanSuccess(span);
            assert.strictEqual(span.spanContext().traceId, sampledHttpSpanContext.traceId);
            assert.strictEqual(span.parentSpanId, sampledHttpSpanContext.spanId);
        });
        it('uses http context if unsampled and lambda context unsampled', async () => {
            process.env[src_1.traceContextEnvironmentKey] = unsampledAwsHeader;
            initializeHandler('lambda-test/async.handler');
            const proxyEvent = {
                headers: {
                    traceparent: unsampledHttpHeader,
                },
            };
            const result = await lambdaRequire('lambda-test/async').handler(proxyEvent, ctx);
            assert.strictEqual(result, 'ok');
            const spans = memoryExporter.getFinishedSpans();
            // Parent unsampled so no spans exported.
            assert.strictEqual(spans.length, 0);
        });
        it('ignores sampled lambda context if "disableAwsContextPropagation" config option is true', async () => {
            process.env[src_1.traceContextEnvironmentKey] = sampledAwsHeader;
            initializeHandler('lambda-test/async.handler', {
                disableAwsContextPropagation: true,
            });
            const result = await lambdaRequire('lambda-test/async').handler('arg', ctx);
            assert.strictEqual(result, 'ok');
            const spans = memoryExporter.getFinishedSpans();
            const [span] = spans;
            assert.strictEqual(spans.length, 1);
            exports.assertSpanSuccess(span);
            assert.notDeepStrictEqual(span.spanContext().traceId, sampledAwsSpanContext.traceId);
            assert.strictEqual(span.parentSpanId, undefined);
        });
        it('takes sampled http context over sampled lambda context if "disableAwsContextPropagation" config option is true', async () => {
            process.env[src_1.traceContextEnvironmentKey] = sampledAwsHeader;
            initializeHandler('lambda-test/async.handler', {
                disableAwsContextPropagation: true,
            });
            const proxyEvent = {
                headers: {
                    traceparent: sampledHttpHeader,
                },
            };
            const result = await lambdaRequire('lambda-test/async').handler(proxyEvent, ctx);
            assert.strictEqual(result, 'ok');
            const spans = memoryExporter.getFinishedSpans();
            const [span] = spans;
            assert.strictEqual(spans.length, 1);
            exports.assertSpanSuccess(span);
            assert.strictEqual(span.spanContext().traceId, sampledHttpSpanContext.traceId);
            assert.strictEqual(span.parentSpanId, sampledHttpSpanContext.spanId);
        });
        it('takes sampled custom context over sampled lambda context if "eventContextExtractor" is defined', async () => {
            process.env[src_1.traceContextEnvironmentKey] = sampledAwsHeader;
            const customExtractor = (event) => {
                return api_1.propagation.extract(api_1.context.active(), event.contextCarrier);
            };
            initializeHandler('lambda-test/async.handler', {
                disableAwsContextPropagation: true,
                eventContextExtractor: customExtractor,
            });
            const otherEvent = {
                contextCarrier: {
                    traceparent: sampledGenericSpan,
                },
            };
            const result = await lambdaRequire('lambda-test/async').handler(otherEvent, ctx);
            assert.strictEqual(result, 'ok');
            const spans = memoryExporter.getFinishedSpans();
            const [span] = spans;
            assert.strictEqual(spans.length, 1);
            exports.assertSpanSuccess(span);
            assert.strictEqual(span.spanContext().traceId, sampledGenericSpanContext.traceId);
            assert.strictEqual(span.parentSpanId, sampledGenericSpanContext.spanId);
        });
        it('prefers to extract baggage over sampled lambda context if "eventContextExtractor" is defined', async () => {
            process.env[src_1.traceContextEnvironmentKey] = sampledAwsHeader;
            const customExtractor = (event) => {
                return api_1.propagation.extract(api_1.context.active(), event.customContextCarrier);
            };
            initializeHandler('lambda-test/async.handler_return_baggage', {
                disableAwsContextPropagation: true,
                eventContextExtractor: customExtractor,
            });
            const baggage = 'abcd=1234';
            const customRemoteEvent = {
                customContextCarrier: {
                    traceparent: sampledGenericSpan,
                    baggage,
                },
            };
            const lambdaTestAsync = lambdaRequire('lambda-test/async');
            const actual = await lambdaTestAsync.handler_return_baggage(customRemoteEvent, ctx);
            assert.strictEqual(actual, baggage);
        });
        it('creates trace from ROOT_CONTEXT when "disableAwsContextPropagation" is true, eventContextExtractor is provided, and no custom context is found', async () => {
            process.env[src_1.traceContextEnvironmentKey] = sampledAwsHeader;
            const customExtractor = (event) => {
                if (!event.contextCarrier) {
                    return api_1.ROOT_CONTEXT;
                }
                return api_1.propagation.extract(api_1.context.active(), event.contextCarrier);
            };
            initializeHandler('lambda-test/async.handler', {
                disableAwsContextPropagation: true,
                eventContextExtractor: customExtractor,
            });
            const testSpan = provider.getTracer('test').startSpan('random_span');
            await api_1.context.with(api_1.trace.setSpan(api_1.context.active(), testSpan), async () => {
                await lambdaRequire('lambda-test/async').handler({ message: 'event with no context' }, ctx);
            });
            const spans = memoryExporter.getFinishedSpans();
            const [span] = spans;
            assert.strictEqual(span.parentSpanId, undefined);
        });
        it('passes the lambda context object into the eventContextExtractor for scenarios where it is the otel context carrier', async () => {
            process.env[src_1.traceContextEnvironmentKey] = sampledAwsHeader;
            const customExtractor = (event, handlerContext) => {
                var _a, _b;
                const contextCarrier = (_b = (_a = handlerContext.clientContext) === null || _a === void 0 ? void 0 : _a.Custom) !== null && _b !== void 0 ? _b : {};
                return api_1.propagation.extract(api_1.context.active(), contextCarrier);
            };
            initializeHandler('lambda-test/async.handler', {
                disableAwsContextPropagation: true,
                eventContextExtractor: customExtractor,
            });
            const otherEvent = {};
            const ctxWithCustomData = {
                functionName: 'my_function',
                invokedFunctionArn: 'my_arn',
                awsRequestId: 'aws_request_id',
                clientContext: {
                    client: {
                        installationId: '',
                        appTitle: '',
                        appVersionName: '',
                        appVersionCode: '',
                        appPackageName: '',
                    },
                    Custom: {
                        traceparent: sampledGenericSpan,
                    },
                    env: {
                        platformVersion: '',
                        platform: '',
                        make: '',
                        model: '',
                        locale: '',
                    },
                },
            };
            const result = await lambdaRequire('lambda-test/async').handler(otherEvent, ctxWithCustomData);
            assert.strictEqual(result, 'ok');
            const spans = memoryExporter.getFinishedSpans();
            const [span] = spans;
            assert.strictEqual(spans.length, 1);
            exports.assertSpanSuccess(span);
            assert.strictEqual(span.spanContext().traceId, sampledGenericSpanContext.traceId);
            assert.strictEqual(span.parentSpanId, sampledGenericSpanContext.spanId);
        });
    });
    describe('hooks', () => {
        describe('requestHook', () => {
            it('sync - success', async () => {
                initializeHandler('lambda-test/async.handler', {
                    requestHook: (span, { context }) => {
                        span.setAttribute(semantic_conventions_1.SemanticResourceAttributes.FAAS_NAME, context.functionName);
                    },
                });
                await lambdaRequire('lambda-test/async').handler('arg', ctx);
                const spans = memoryExporter.getFinishedSpans();
                const [span] = spans;
                assert.strictEqual(spans.length, 1);
                assert.strictEqual(span.attributes[semantic_conventions_1.SemanticResourceAttributes.FAAS_NAME], ctx.functionName);
                exports.assertSpanSuccess(span);
            });
        });
        describe('responseHook', () => {
            const RES_ATTR = 'test.res';
            const ERR_ATTR = 'test.error';
            const config = {
                responseHook: (span, { err, res }) => {
                    if (err)
                        span.setAttribute(ERR_ATTR, typeof err === 'string' ? err : err.message);
                    if (res)
                        span.setAttribute(RES_ATTR, typeof res === 'string' ? res : JSON.stringify(res));
                },
            };
            it('async - success', async () => {
                initializeHandler('lambda-test/async.handler', config);
                const res = await lambdaRequire('lambda-test/async').handler('arg', ctx);
                const [span] = memoryExporter.getFinishedSpans();
                assert.strictEqual(span.attributes[RES_ATTR], res);
            });
            it('async - error', async () => {
                initializeHandler('lambda-test/async.error', config);
                let err;
                try {
                    await lambdaRequire('lambda-test/async').error('arg', ctx);
                }
                catch (e) {
                    err = e;
                }
                const [span] = memoryExporter.getFinishedSpans();
                assert.strictEqual(span.attributes[ERR_ATTR], err.message);
            });
            it('sync - success', async () => {
                initializeHandler('lambda-test/sync.handler', config);
                const result = await new Promise((resolve, _reject) => {
                    lambdaRequire('lambda-test/sync').handler('arg', ctx, (_err, res) => resolve(res));
                });
                const [span] = memoryExporter.getFinishedSpans();
                assert.strictEqual(span.attributes[RES_ATTR], result);
            });
            it('sync - error', async () => {
                initializeHandler('lambda-test/sync.error', config);
                let err;
                try {
                    lambdaRequire('lambda-test/sync').error('arg', ctx, () => { });
                }
                catch (e) {
                    err = e;
                }
                const [span] = memoryExporter.getFinishedSpans();
                assert.strictEqual(span.attributes[ERR_ATTR], err.message);
            });
            it('sync - error with callback', async () => {
                initializeHandler('lambda-test/sync.callbackerror', config);
                let error;
                await new Promise((resolve, _reject) => {
                    lambdaRequire('lambda-test/sync').callbackerror('arg', ctx, (err, _res) => {
                        error = err;
                        resolve({});
                    });
                });
                const [span] = memoryExporter.getFinishedSpans();
                assert.strictEqual(span.attributes[ERR_ATTR], error.message);
            });
        });
    });
});
//# sourceMappingURL=lambda-handler.test.js.map