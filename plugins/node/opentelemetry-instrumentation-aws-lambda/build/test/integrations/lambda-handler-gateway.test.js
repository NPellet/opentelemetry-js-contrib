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
// We access through node_modules to allow it to be patched.
/* eslint-disable node/no-extraneous-require */
const path = require("path");
const src_1 = require("../../src");
const sdk_trace_base_1 = require("@opentelemetry/sdk-trace-base");
const sdk_trace_node_1 = require("@opentelemetry/sdk-trace-node");
const assert = require("assert");
const semantic_conventions_1 = require("@opentelemetry/semantic-conventions");
const api_1 = require("@opentelemetry/api");
const lambda_handler_test_1 = require("./lambda-handler.test");
const memoryExporter = new sdk_trace_base_1.InMemorySpanExporter();
const provider = new sdk_trace_node_1.NodeTracerProvider();
provider.addSpanProcessor(new sdk_trace_base_1.BatchSpanProcessor(memoryExporter));
provider.register();
const event = {
    requestContext: {
        accountId: '123456789012',
        apiId: 'id',
        authorizer: {
            claims: null,
            scopes: null,
        },
        domainName: 'id.execute-api.us-east-1.amazonaws.com',
        domainPrefix: 'id',
        extendedRequestId: 'request-id',
        httpMethod: 'GET',
        path: '/my/path',
        protocol: 'HTTP/1.1',
        requestId: 'id=',
        requestTime: '04/Mar/2020:19:15:17 +0000',
        requestTimeEpoch: 1583349317135,
        resourceId: null,
        resourcePath: '/my/path',
        stage: '$default',
    },
};
const assertGatewaySpanSuccess = (span) => {
    assert.strictEqual(span.kind, api_1.SpanKind.SERVER);
    assert.strictEqual(span.name, event.requestContext.domainName + event.requestContext.path);
    assert.strictEqual(span.status.code, api_1.SpanStatusCode.OK);
    assert.strictEqual(span.status.message, undefined);
    assert.strictEqual(span.attributes[semantic_conventions_1.SemanticAttributes.HTTP_METHOD], event.requestContext.httpMethod);
    assert.strictEqual(span.attributes[semantic_conventions_1.SemanticAttributes.HTTP_ROUTE], event.requestContext.resourcePath);
    assert.strictEqual(span.attributes[semantic_conventions_1.SemanticAttributes.HTTP_SERVER_NAME], event.requestContext.domainName);
    assert.strictEqual(span.attributes[semantic_conventions_1.SemanticResourceAttributes.CLOUD_ACCOUNT_ID], event.requestContext.accountId);
};
const assertGatewaySpanFailure = (span) => {
    assert.strictEqual(span.kind, api_1.SpanKind.SERVER);
    assert.strictEqual(span.name, event.requestContext.domainName + event.requestContext.path);
    assert.strictEqual(span.status.code, api_1.SpanStatusCode.ERROR);
};
describe('gateway API handler', () => {
    let instrumentation;
    let oldEnv;
    const ctx = {
        functionName: 'my_function',
        invokedFunctionArn: 'my_arn',
        awsRequestId: 'aws_request_id',
    };
    const initializeHandler = (handler, config = {
        detectApiGateway: {
            enable: true,
            errorCodes: [400, 500],
        },
    }) => {
        process.env._HANDLER = handler;
        instrumentation = new src_1.AwsLambdaInstrumentation(config);
        instrumentation.setTracerProvider(provider);
    };
    const lambdaRequire = (module) => require(path.resolve(__dirname, '..', module));
    beforeEach(() => {
        oldEnv = Object.assign({}, process.env);
        process.env.LAMBDA_TASK_ROOT = path.resolve(__dirname, '..');
    });
    afterEach(() => {
        process.env = oldEnv;
        instrumentation.disable();
        memoryExporter.reset();
    });
    describe('gateway span tests', () => {
        it('should export two valid span', async () => {
            initializeHandler('lambda-test/gateway.handler');
            const result = await lambdaRequire('lambda-test/gateway').handler(event, ctx);
            assert.strictEqual(result.statusCode, 200);
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 2);
            const [spanLambda, spanGateway] = spans;
            lambda_handler_test_1.assertSpanSuccess(spanLambda);
            assertGatewaySpanSuccess(spanGateway);
            assert.strictEqual(spanGateway.attributes[semantic_conventions_1.SemanticAttributes.HTTP_STATUS_CODE], 200);
            assert.strictEqual(spanGateway.parentSpanId, undefined);
            assert.strictEqual(spanLambda.parentSpanId, spanGateway.spanContext().spanId);
        });
        it('gateway span should reject when returning 500 ', async () => {
            initializeHandler('lambda-test/gateway.error500');
            const result = await lambdaRequire('lambda-test/gateway').error500(event, ctx);
            assert.strictEqual(result.statusCode, 500);
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 2);
            const [spanLambda, spanGateway] = spans;
            assert.strictEqual(spanGateway.status.message, 'Return to API Gateway with error 500');
            lambda_handler_test_1.assertSpanSuccess(spanLambda);
            assertGatewaySpanFailure(spanGateway);
            assert.strictEqual(spanGateway.parentSpanId, undefined);
            assert.strictEqual(spanGateway.attributes[semantic_conventions_1.SemanticAttributes.HTTP_STATUS_CODE], 500);
            assert.strictEqual(spanLambda.parentSpanId, spanGateway.spanContext().spanId);
        });
        it('gateway span should reject when returning 400 ', async () => {
            initializeHandler('lambda-test/gateway.error400');
            const result = await lambdaRequire('lambda-test/gateway').error400(event, ctx);
            assert.strictEqual(result.statusCode, 400);
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 2);
            const [_, spanGateway] = spans;
            assert.strictEqual(spanGateway.attributes[semantic_conventions_1.SemanticAttributes.HTTP_STATUS_CODE], 400);
            assert.strictEqual(spanGateway.status.message, 'Return to API Gateway with error 400');
            assertGatewaySpanFailure(spanGateway);
        });
        it('gateway span should reject when returning 400 sync', async () => {
            initializeHandler('lambda-test/gateway.error400Sync');
            await new Promise((resolve, reject) => {
                lambdaRequire('lambda-test/gateway').error400Sync(event, ctx, (err, res) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve(res);
                    }
                });
            });
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 2);
            const [_, spanGateway] = spans;
            assert.strictEqual(spanGateway.attributes[semantic_conventions_1.SemanticAttributes.HTTP_STATUS_CODE], 400);
            assert.strictEqual(spanGateway.status.message, 'Return to API Gateway with error 400');
            assertGatewaySpanFailure(spanGateway);
        });
        it('gateway span should reject when throwing error', async () => {
            initializeHandler('lambda-test/gateway.errorAsync');
            //let err: any;
            try {
                await lambdaRequire('lambda-test/gateway').errorAsync(event, ctx);
            }
            catch (e) {
                //err = e;
            }
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 2);
            const [_, spanGateway] = spans;
            assert.strictEqual(spanGateway.status.message, 'handler error');
        });
    });
    describe("Filtering error codes", async () => {
        it("Span should not fail when error code not in list", async () => {
            initializeHandler('lambda-test/gateway.error400', {
                detectApiGateway: { enable: true, errorCodes: [500] }
            });
            const result = await lambdaRequire('lambda-test/gateway').error400(event, ctx);
            assert.strictEqual(result.statusCode, 400);
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 2);
            const [_, spanGateway] = spans;
            assert.strictEqual(spanGateway.status.code, api_1.SpanStatusCode.OK);
        });
        it("Span fail when matching regex", async () => {
            initializeHandler('lambda-test/gateway.error400', {
                detectApiGateway: { enable: true, errorCodes: [/^4[0-9]{2}$/] }
            });
            const result = await lambdaRequire('lambda-test/gateway').error400(event, ctx);
            assert.strictEqual(result.statusCode, 400);
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 2);
            const [_, spanGateway] = spans;
            assert.strictEqual(spanGateway.status.code, api_1.SpanStatusCode.ERROR);
        });
        it("Span should have unset status when no error code is provided", async () => {
            initializeHandler('lambda-test/gateway.error400', {
                detectApiGateway: { enable: true }
            });
            const result = await lambdaRequire('lambda-test/gateway').error400(event, ctx);
            assert.strictEqual(result.statusCode, 400);
            const spans = memoryExporter.getFinishedSpans();
            assert.strictEqual(spans.length, 2);
            const [_, spanGateway] = spans;
            assert.strictEqual(spanGateway.status.code, api_1.SpanStatusCode.UNSET);
        });
    });
});
//# sourceMappingURL=lambda-handler-gateway.test.js.map