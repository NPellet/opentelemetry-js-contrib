import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import { TextMapGetter, TracerProvider } from '@opentelemetry/api';
import { AwsLambdaInstrumentationConfig } from './types';
import { SQS } from 'aws-sdk';
declare type LowerCase<T> = T extends {} ? {
    [K in keyof T as K extends string ? string extends K ? string : `${Uncapitalize<string & K>}` : K]: T[K] extends {} | undefined ? LowerCase<T[K]> : T[K];
} : T;
declare class ContextGetter implements TextMapGetter<LowerCase<SQS.MessageBodyAttributeMap>> {
    keys(carrier: LowerCase<SQS.MessageBodyAttributeMap>): string[];
    get(carrier: any, key: string): undefined | string | string[];
}
export declare const contextGetter: ContextGetter;
export declare const traceContextEnvironmentKey = "_X_AMZN_TRACE_ID";
export declare class AwsLambdaInstrumentation extends InstrumentationBase {
    protected _config: AwsLambdaInstrumentationConfig;
    private _forceFlush?;
    private triggerOrigin;
    constructor(_config?: AwsLambdaInstrumentationConfig);
    setConfig(config?: AwsLambdaInstrumentationConfig): void;
    init(): InstrumentationNodeModuleDefinition<unknown>[];
    private _getHandler;
    private _getPatchHandler;
    private _getApiGatewaySpan;
    setTracerProvider(tracerProvider: TracerProvider): void;
    private _endWrapperSpan;
    private _endAPIGatewaySpan;
    private _getForceFlush;
    private _wrapCallback;
    private _flush;
    private _endSpan;
    private _errorToString;
    private _applyResponseHook;
    private static _extractAccountId;
    private static _defaultEventContextExtractor;
    private static _determineParent;
}
export {};
//# sourceMappingURL=instrumentation.d.ts.map