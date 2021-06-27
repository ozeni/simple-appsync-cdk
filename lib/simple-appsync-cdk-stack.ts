import * as core from "@aws-cdk/core";
import { CfnGraphQLApi, CfnApiKey, CfnGraphQLSchema, CfnDataSource, CfnResolver } from '@aws-cdk/aws-appsync'
import { Table, AttributeType } from '@aws-cdk/aws-dynamodb'
import { Role, ServicePrincipal, ManagedPolicy } from '@aws-cdk/aws-iam'

import { definition } from './schema'

const tableName = 'items'

export class SimpleAppsyncCdkStack extends core.Stack {
  constructor(scope: core.App, id: string, props?: core.StackProps) {
    super(scope, id, props);

    const graphQLApi = new CfnGraphQLApi(this, "AppSyncAPI", {
      name: "MyAppSyncAPI",
      authenticationType: "API_KEY"
    });

    // API設定
    new CfnApiKey(this, 'ItemsApiKey', {
      apiId: graphQLApi.attrApiId
    })

    // スキーマ設定
    const Schema = new CfnGraphQLSchema(this, 'ItemsSchema', {
      apiId: graphQLApi.attrApiId,
      definition,
    })

    // DynamoDB設定
    const dynamoTable = new Table(this, 'items', {
      partitionKey: {
        name: 'id',
        type: AttributeType.STRING
      },
      tableName,
      removalPolicy: core.RemovalPolicy.DESTROY,
    })

    // IAM設定
    const dataSourceIamRole = new Role(this, 'dataSourceIamRole', {
      assumedBy: new ServicePrincipal('appsync.amazonaws.com')
    })
    dataSourceIamRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'))

    // データソースとリゾルバのアタッチ
    const dataSource = new CfnDataSource(this, 'dataSource', {
      apiId: graphQLApi.attrApiId,
      name: 'ItemsDynamoDataSource',
      serviceRoleArn: dataSourceIamRole.roleArn,
      type: 'AMAZON_DYNAMODB',
      dynamoDbConfig: {
        tableName,
        awsRegion:this.region
      }
    })
    
    const getItemResolver = new CfnResolver(this, 'getItemResolver', {
      apiId: graphQLApi.attrApiId,
      typeName: 'Query',
      fieldName: 'getItem',
      dataSourceName: dataSource.name,
      requestMappingTemplate: `{
        "version": "2017-02-28",
        "operation": "GetItem",
        "key": {
          "id": $util.dynamodb.toDynamoDBJson($ctx.args.id)
        }
      }`,
      responseMappingTemplate: `$util.toJson($ctx.result)`
    })
    getItemResolver.addDependsOn(Schema)

    const addItemResolver = new CfnResolver(this, 'addItemResolver', {
      apiId: graphQLApi.attrApiId,
      typeName: 'Mutation',
      fieldName: 'addItem',
      dataSourceName: dataSource.name,
      requestMappingTemplate: `{
        "version": "2017-02-28",
        "operation": "PutItem",
        "key": {
          "id": { "S": "$util.autoId()" }
        },
        "attributeValues": {
          "name": $util.dynamodb.toDynamoDBJson($ctx.args.name)
        }
      }`,
      responseMappingTemplate: `$util.toJson($ctx.result)`
    })
    addItemResolver.addDependsOn(Schema)

    const deleteItemResolver = new CfnResolver(this, 'deleteItemResolver', {
      apiId: graphQLApi.attrApiId,
      typeName: 'Mutation',
      fieldName: 'deleteItem',
      dataSourceName: dataSource.name,
      requestMappingTemplate: `{
        "version": "2017-02-28",
        "operation": "DeleteItem",
        "key": {
          "id": $util.dynamodb.toDynamoDBJson($ctx.args.id)
        }
      }`,
      responseMappingTemplate: `$util.toJson($ctx.result)`
    })
    deleteItemResolver.addDependsOn(Schema)

  }
}