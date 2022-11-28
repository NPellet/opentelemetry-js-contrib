import { Handler } from 'aws-lambda';
export declare const enum TriggerOrigin {
    API_GATEWAY = 0
}
export declare type ApiGatewayEvent = {
    resource: string;
    path: string;
    httpMethod: string;
    requestContext: ApiGatewayRequestContext;
    headers: Record<string, string>;
    multiValueHeaders: Record<string, string[]>;
    queryStringParameters: string | null;
    multiValueQueryStringParameters: Record<string, string[]>;
    pathParameters: any;
    stageVariables: any;
    body: string;
    isBase64Encoded: boolean;
};
export declare type ApiGatewayRequestContext = {
    accountId: string;
    apiId: string;
    resourceId: string;
    authorizer: {
        claims: string | null;
        scopes: string | null;
        principalId: string | null;
    };
    domainName: string;
    domainPrefix: string;
    extendedRequestId: string;
    httpMethod: string;
    identity: {
        accessKey: string | null;
        accountId: string | null;
        caller: string | null;
        cognitoAuthenticationProvider: string | null;
        cognitoAuthenticationType: string | null;
        cognitoIdentityPool: string | null;
        principalOrdId: string | null;
        sourceIp: string | null;
        user: string | null;
        userAgent: string;
        userArn: string | null;
        clientCert: any;
    };
    path: string;
    protocol: string;
    requestId: string;
    requestTime: string;
    requestTimeEpoch: string;
    stage: string;
    resourcePath: any;
};
export declare type LambdaModule = Record<string, Handler>;
//# sourceMappingURL=internal-types.d.ts.map