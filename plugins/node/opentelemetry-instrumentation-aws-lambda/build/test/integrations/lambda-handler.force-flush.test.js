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
const api_1 = require("@opentelemetry/api");
const memoryExporter = new sdk_trace_base_1.InMemorySpanExporter();
describe('force flush', () => {
    let instrumentation;
    let oldEnv;
    const ctx = {
        functionName: 'my_function',
        invokedFunctionArn: 'my_arn',
        awsRequestId: 'aws_request_id',
    };
    const initializeHandler = (handler, provider) => {
        process.env._HANDLER = handler;
        instrumentation = new src_1.AwsLambdaInstrumentation();
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
    it('should force flush NodeTracerProvider', async () => {
        const provider = new sdk_trace_node_1.NodeTracerProvider();
        provider.addSpanProcessor(new sdk_trace_base_1.BatchSpanProcessor(memoryExporter));
        provider.register();
        let forceFlushed = false;
        const forceFlush = () => new Promise(resolve => {
            forceFlushed = true;
            resolve();
        });
        provider.forceFlush = forceFlush;
        initializeHandler('lambda-test/sync.handler', provider);
        await new Promise((resolve, reject) => {
            lambdaRequire('lambda-test/sync').handler('arg', ctx, (err, res) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(res);
                }
            });
        });
        assert.strictEqual(forceFlushed, true);
    });
    it('should force flush ProxyTracerProvider with NodeTracerProvider', async () => {
        const nodeTracerProvider = new sdk_trace_node_1.NodeTracerProvider();
        nodeTracerProvider.addSpanProcessor(new sdk_trace_base_1.BatchSpanProcessor(memoryExporter));
        nodeTracerProvider.register();
        const provider = new api_1.ProxyTracerProvider();
        provider.setDelegate(nodeTracerProvider);
        let forceFlushed = false;
        const forceFlush = () => new Promise(resolve => {
            forceFlushed = true;
            resolve();
        });
        nodeTracerProvider.forceFlush = forceFlush;
        initializeHandler('lambda-test/sync.handler', provider);
        await new Promise((resolve, reject) => {
            lambdaRequire('lambda-test/sync').handler('arg', ctx, (err, res) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(res);
                }
            });
        });
        assert.strictEqual(forceFlushed, true);
    });
});
//# sourceMappingURL=lambda-handler.force-flush.test.js.map