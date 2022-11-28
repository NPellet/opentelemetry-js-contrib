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
import { trace, TraceFlags, isSpanContextValid, isValidSpanId, isValidTraceId, INVALID_TRACEID, INVALID_SPANID, INVALID_SPAN_CONTEXT, } from '@opentelemetry/api';
export var AWSXRAY_TRACE_ID_HEADER = 'x-amzn-trace-id';
export var AWS_TRACE_ID_MESSAGE = 'AWSTraceHeader';
var TRACE_HEADER_DELIMITER = ';';
var KV_DELIMITER = '=';
var TRACE_ID_KEY = 'Root';
var TRACE_ID_LENGTH = 35;
var TRACE_ID_VERSION = '1';
var TRACE_ID_DELIMITER = '-';
var TRACE_ID_DELIMITER_INDEX_1 = 1;
var TRACE_ID_DELIMITER_INDEX_2 = 10;
var TRACE_ID_FIRST_PART_LENGTH = 8;
var PARENT_ID_KEY = 'Parent';
var SAMPLED_FLAG_KEY = 'Sampled';
var IS_SAMPLED = '1';
var NOT_SAMPLED = '0';
/**
 * Implementation of the AWS X-Ray Trace Header propagation protocol. See <a href=
 * https://https://docs.aws.amazon.com/xray/latest/devguide/xray-concepts.html#xray-concepts-tracingheader>AWS
 * Tracing header spec</a>
 *
 * An example AWS Xray Tracing Header is shown below:
 * X-Amzn-Trace-Id: Root=1-5759e988-bd862e3fe1be46a994272793;Parent=53995c3f42cd8ad8;Sampled=1
 */
var AWSXRayPropagator = /** @class */ (function () {
    function AWSXRayPropagator() {
    }
    AWSXRayPropagator.prototype.inject = function (context, carrier, setter) {
        var _a;
        var spanContext = (_a = trace.getSpan(context)) === null || _a === void 0 ? void 0 : _a.spanContext();
        if (!spanContext || !isSpanContextValid(spanContext))
            return;
        var otTraceId = spanContext.traceId;
        var timestamp = otTraceId.substring(0, TRACE_ID_FIRST_PART_LENGTH);
        var randomNumber = otTraceId.substring(TRACE_ID_FIRST_PART_LENGTH);
        var parentId = spanContext.spanId;
        var samplingFlag = (TraceFlags.SAMPLED & spanContext.traceFlags) === TraceFlags.SAMPLED
            ? IS_SAMPLED
            : NOT_SAMPLED;
        // TODO: Add OT trace state to the X-Ray trace header
        var traceHeader = "Root=1-" + timestamp + "-" + randomNumber + ";Parent=" + parentId + ";Sampled=" + samplingFlag;
        setter.set(carrier, AWSXRAY_TRACE_ID_HEADER, traceHeader);
    };
    AWSXRayPropagator.prototype.extract = function (context, carrier, getter) {
        var spanContext = this.getSpanContextFromHeader(carrier, getter);
        if (!isSpanContextValid(spanContext))
            return context;
        return trace.setSpan(context, trace.wrapSpanContext(spanContext));
    };
    AWSXRayPropagator.prototype.fields = function () {
        return [AWSXRAY_TRACE_ID_HEADER, AWS_TRACE_ID_MESSAGE];
    };
    AWSXRayPropagator.prototype.getSpanContextFromHeader = function (carrier, getter) {
        var traceHeader = getter.get(carrier, AWSXRAY_TRACE_ID_HEADER) || getter.get(carrier, AWS_TRACE_ID_MESSAGE);
        if (!traceHeader || typeof traceHeader !== 'string')
            return INVALID_SPAN_CONTEXT;
        var pos = 0;
        var trimmedPart;
        var parsedTraceId = INVALID_TRACEID;
        var parsedSpanId = INVALID_SPANID;
        var parsedTraceFlags = null;
        while (pos < traceHeader.length) {
            var delimiterIndex = traceHeader.indexOf(TRACE_HEADER_DELIMITER, pos);
            if (delimiterIndex >= 0) {
                trimmedPart = traceHeader.substring(pos, delimiterIndex).trim();
                pos = delimiterIndex + 1;
            }
            else {
                //last part
                trimmedPart = traceHeader.substring(pos).trim();
                pos = traceHeader.length;
            }
            var equalsIndex = trimmedPart.indexOf(KV_DELIMITER);
            var value = trimmedPart.substring(equalsIndex + 1);
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
            return INVALID_SPAN_CONTEXT;
        }
        var resultSpanContext = {
            traceId: parsedTraceId,
            spanId: parsedSpanId,
            traceFlags: parsedTraceFlags,
            isRemote: true,
        };
        if (!isSpanContextValid(resultSpanContext)) {
            return INVALID_SPAN_CONTEXT;
        }
        return resultSpanContext;
    };
    AWSXRayPropagator._parseTraceId = function (xrayTraceId) {
        // Check length of trace id
        if (xrayTraceId.length !== TRACE_ID_LENGTH) {
            return INVALID_TRACEID;
        }
        // Check version trace id version
        if (!xrayTraceId.startsWith(TRACE_ID_VERSION)) {
            return INVALID_TRACEID;
        }
        // Check delimiters
        if (xrayTraceId.charAt(TRACE_ID_DELIMITER_INDEX_1) !== TRACE_ID_DELIMITER ||
            xrayTraceId.charAt(TRACE_ID_DELIMITER_INDEX_2) !== TRACE_ID_DELIMITER) {
            return INVALID_TRACEID;
        }
        var epochPart = xrayTraceId.substring(TRACE_ID_DELIMITER_INDEX_1 + 1, TRACE_ID_DELIMITER_INDEX_2);
        var uniquePart = xrayTraceId.substring(TRACE_ID_DELIMITER_INDEX_2 + 1, TRACE_ID_LENGTH);
        var resTraceId = epochPart + uniquePart;
        // Check the content of trace id
        if (!isValidTraceId(resTraceId)) {
            return INVALID_TRACEID;
        }
        return resTraceId;
    };
    AWSXRayPropagator._parseSpanId = function (xrayParentId) {
        return isValidSpanId(xrayParentId) ? xrayParentId : INVALID_SPANID;
    };
    AWSXRayPropagator._parseTraceFlag = function (xraySampledFlag) {
        if (xraySampledFlag === NOT_SAMPLED) {
            return TraceFlags.NONE;
        }
        if (xraySampledFlag === IS_SAMPLED) {
            return TraceFlags.SAMPLED;
        }
        return null;
    };
    return AWSXRayPropagator;
}());
export { AWSXRayPropagator };
//# sourceMappingURL=AWSXRayPropagator.js.map