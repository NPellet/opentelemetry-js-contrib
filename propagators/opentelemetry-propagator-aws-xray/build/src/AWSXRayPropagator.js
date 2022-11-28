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
exports.AWSXRayPropagator = exports.AWS_TRACE_ID_MESSAGE = exports.AWSXRAY_TRACE_ID_HEADER = void 0;
const api_1 = require("@opentelemetry/api");
exports.AWSXRAY_TRACE_ID_HEADER = 'x-amzn-trace-id';
exports.AWS_TRACE_ID_MESSAGE = 'AWSTraceHeader';
const TRACE_HEADER_DELIMITER = ';';
const KV_DELIMITER = '=';
const TRACE_ID_KEY = 'Root';
const TRACE_ID_LENGTH = 35;
const TRACE_ID_VERSION = '1';
const TRACE_ID_DELIMITER = '-';
const TRACE_ID_DELIMITER_INDEX_1 = 1;
const TRACE_ID_DELIMITER_INDEX_2 = 10;
const TRACE_ID_FIRST_PART_LENGTH = 8;
const PARENT_ID_KEY = 'Parent';
const SAMPLED_FLAG_KEY = 'Sampled';
const IS_SAMPLED = '1';
const NOT_SAMPLED = '0';
/**
 * Implementation of the AWS X-Ray Trace Header propagation protocol. See <a href=
 * https://https://docs.aws.amazon.com/xray/latest/devguide/xray-concepts.html#xray-concepts-tracingheader>AWS
 * Tracing header spec</a>
 *
 * An example AWS Xray Tracing Header is shown below:
 * X-Amzn-Trace-Id: Root=1-5759e988-bd862e3fe1be46a994272793;Parent=53995c3f42cd8ad8;Sampled=1
 */
class AWSXRayPropagator {
    inject(context, carrier, setter) {
        var _a;
        const spanContext = (_a = api_1.trace.getSpan(context)) === null || _a === void 0 ? void 0 : _a.spanContext();
        if (!spanContext || !api_1.isSpanContextValid(spanContext))
            return;
        const otTraceId = spanContext.traceId;
        const timestamp = otTraceId.substring(0, TRACE_ID_FIRST_PART_LENGTH);
        const randomNumber = otTraceId.substring(TRACE_ID_FIRST_PART_LENGTH);
        const parentId = spanContext.spanId;
        const samplingFlag = (api_1.TraceFlags.SAMPLED & spanContext.traceFlags) === api_1.TraceFlags.SAMPLED
            ? IS_SAMPLED
            : NOT_SAMPLED;
        // TODO: Add OT trace state to the X-Ray trace header
        const traceHeader = `Root=1-${timestamp}-${randomNumber};Parent=${parentId};Sampled=${samplingFlag}`;
        setter.set(carrier, exports.AWSXRAY_TRACE_ID_HEADER, traceHeader);
    }
    extract(context, carrier, getter) {
        const spanContext = this.getSpanContextFromHeader(carrier, getter);
        if (!api_1.isSpanContextValid(spanContext))
            return context;
        return api_1.trace.setSpan(context, api_1.trace.wrapSpanContext(spanContext));
    }
    fields() {
        return [exports.AWSXRAY_TRACE_ID_HEADER, exports.AWS_TRACE_ID_MESSAGE];
    }
    getSpanContextFromHeader(carrier, getter) {
        const traceHeader = getter.get(carrier, exports.AWSXRAY_TRACE_ID_HEADER) || getter.get(carrier, exports.AWS_TRACE_ID_MESSAGE);
        if (!traceHeader || typeof traceHeader !== 'string')
            return api_1.INVALID_SPAN_CONTEXT;
        let pos = 0;
        let trimmedPart;
        let parsedTraceId = api_1.INVALID_TRACEID;
        let parsedSpanId = api_1.INVALID_SPANID;
        let parsedTraceFlags = null;
        while (pos < traceHeader.length) {
            const delimiterIndex = traceHeader.indexOf(TRACE_HEADER_DELIMITER, pos);
            if (delimiterIndex >= 0) {
                trimmedPart = traceHeader.substring(pos, delimiterIndex).trim();
                pos = delimiterIndex + 1;
            }
            else {
                //last part
                trimmedPart = traceHeader.substring(pos).trim();
                pos = traceHeader.length;
            }
            const equalsIndex = trimmedPart.indexOf(KV_DELIMITER);
            const value = trimmedPart.substring(equalsIndex + 1);
            if (trimmedPart.startsWith(TRACE_ID_KEY)) {
                parsedTraceId = AWSXRayPropagator._parseTraceId(value);
            }
            else if (trimmedPart.startsWith(PARENT_ID_KEY)) {
                parsedSpanId = AWSXRayPropagator._parseSpanId(value);
            }
            else if (trimmedPart.startsWith(SAMPLED_FLAG_KEY)) {
                parsedTraceFlags = AWSXRayPropagator._parseTraceFlag(value);
            }
        }
        if (parsedTraceFlags === null) {
            return api_1.INVALID_SPAN_CONTEXT;
        }
        const resultSpanContext = {
            traceId: parsedTraceId,
            spanId: parsedSpanId,
            traceFlags: parsedTraceFlags,
            isRemote: true,
        };
        if (!api_1.isSpanContextValid(resultSpanContext)) {
            return api_1.INVALID_SPAN_CONTEXT;
        }
        return resultSpanContext;
    }
    static _parseTraceId(xrayTraceId) {
        // Check length of trace id
        if (xrayTraceId.length !== TRACE_ID_LENGTH) {
            return api_1.INVALID_TRACEID;
        }
        // Check version trace id version
        if (!xrayTraceId.startsWith(TRACE_ID_VERSION)) {
            return api_1.INVALID_TRACEID;
        }
        // Check delimiters
        if (xrayTraceId.charAt(TRACE_ID_DELIMITER_INDEX_1) !== TRACE_ID_DELIMITER ||
            xrayTraceId.charAt(TRACE_ID_DELIMITER_INDEX_2) !== TRACE_ID_DELIMITER) {
            return api_1.INVALID_TRACEID;
        }
        const epochPart = xrayTraceId.substring(TRACE_ID_DELIMITER_INDEX_1 + 1, TRACE_ID_DELIMITER_INDEX_2);
        const uniquePart = xrayTraceId.substring(TRACE_ID_DELIMITER_INDEX_2 + 1, TRACE_ID_LENGTH);
        const resTraceId = epochPart + uniquePart;
        // Check the content of trace id
        if (!api_1.isValidTraceId(resTraceId)) {
            return api_1.INVALID_TRACEID;
        }
        return resTraceId;
    }
    static _parseSpanId(xrayParentId) {
        return api_1.isValidSpanId(xrayParentId) ? xrayParentId : api_1.INVALID_SPANID;
    }
    static _parseTraceFlag(xraySampledFlag) {
        if (xraySampledFlag === NOT_SAMPLED) {
            return api_1.TraceFlags.NONE;
        }
        if (xraySampledFlag === IS_SAMPLED) {
            return api_1.TraceFlags.SAMPLED;
        }
        return null;
    }
}
exports.AWSXRayPropagator = AWSXRayPropagator;
//# sourceMappingURL=AWSXRayPropagator.js.map