import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';

const API_BASE_URL = 'https://control.ably.net/v1';

interface App {
  id: string;
  name: string;
}

interface Key {
  id: string;
  name: string;
  key: string;
  capability: Record<string, string[]>;
}

interface Namespace {
  batchingPolicy: string | null;
  batchingInterval: string | null;
  batchingEnabled: boolean | null;
  id: string;
  authenticated: boolean;
  persisted: boolean;
  persistLast: boolean;
  pushEnabled: boolean;
  tlsOnly: boolean;
}

interface Queue {
  id: string;
  name: string;
  ttl: number;
  maxLength: number;
  region: string;
}

interface Rule {
  id: string;
  status: string;
  requestMode: string;
  ruleType: string;
  source: {
    channelFilter: string;
    type: string;
  };
  target: any;
}

class AblyTerraformGenerator {
  private token: string;
  private axiosInstance: any;
  private accountId: string;

  constructor() {
    this.token = process.env.ABLY_ACCOUNT_TOKEN || '';
    if (!this.token) {
      throw new Error('ABLY_ACCOUNT_TOKEN environment variable is not set');
    }

    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
    });

    this.accountId = '';
  }

  private async getAccountId(): Promise<string> {
    if (this.accountId) return this.accountId;

    try {
      const response = await this.axiosInstance.get('/me');
      this.accountId = response.data.account.id;
      return this.accountId;
    } catch (error) {
      console.error('Failed to fetch account ID:', error);
      throw new Error(
        'Unable to fetch account ID. Please check your API token.'
      );
    }
  }

  private async getApps(): Promise<App[]> {
    const accountId = await this.getAccountId();
    const response = await this.axiosInstance.get(
      `/accounts/${accountId}/apps`
    );
    return response.data;
  }

  private async getKeys(appId: string): Promise<Key[]> {
    const response = await this.axiosInstance.get(`/apps/${appId}/keys`);
    return response.data;
  }

  private async getNamespaces(appId: string): Promise<Namespace[]> {
    const response = await this.axiosInstance.get(`/apps/${appId}/namespaces`);
    return response.data;
  }

  private async getQueues(appId: string): Promise<Queue[]> {
    const response = await this.axiosInstance.get(`/apps/${appId}/queues`);
    return response.data;
  }

  private async getRules(appId: string): Promise<Rule[]> {
    const response = await this.axiosInstance.get(`/apps/${appId}/rules`);
    return response.data;
  }

  private sanitizeName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  }

  private generateAppTerraform(app: App): string {
    const sanitizedName = this.sanitizeName(app.name);
    return `
resource "ably_app" "${sanitizedName}" {
  name = "${app.name.replace(/"/g, '\\"')}"
}
`;
  }

  private generateKeyTerraform(key: Key, appName: string): string {
    const sanitizedKeyName = this.sanitizeName(key.name);
    const sanitizedAppName = this.sanitizeName(appName);
    const capability = JSON.stringify(key.capability);
    return `
resource "ably_api_key" "${sanitizedAppName}_${sanitizedKeyName}" {
  app_id           = ably_app.${sanitizedAppName}.id
  name             = "${key.name.replace(/"/g, '\\"')}"
  capability       = jsonencode(${capability})
  revocable_tokens = false
}
`;
  }

  private generateNamespaceTerraform(
    namespace: Namespace,
    appName: string
  ): string {
    const sanitizedNamespaceName = this.sanitizeName(namespace.id);
    const sanitizedAppName = this.sanitizeName(appName);
    return `
resource "ably_namespace" "${sanitizedAppName}_${sanitizedNamespaceName}" {
  app_id            = ably_app.${sanitizedAppName}.id
  id                = "${namespace.id}"
  authenticated     = ${namespace.authenticated}
  persisted         = ${namespace.persisted}
  persist_last      = ${namespace.persistLast}
  push_enabled      = ${namespace.pushEnabled}
  tls_only          = ${namespace.tlsOnly}
  batching_enabled  = ${namespace.batchingEnabled || false}
  batching_interval = ${namespace.batchingInterval || 'null'}
  batching_policy   = "${namespace.batchingPolicy || ''}"
}
`;
  }

  private generateQueueTerraform(queue: Queue, appName: string): string {
    const sanitizedQueueName = this.sanitizeName(queue.name);
    const sanitizedAppName = this.sanitizeName(appName);
    return `
resource "ably_queue" "${sanitizedAppName}_${sanitizedQueueName}" {
  app_id     = ably_app.${sanitizedAppName}.id
  name       = "${queue.name.replace(/"/g, '\\"')}"
  ttl        = ${queue.ttl}
  max_length = ${queue.maxLength}
  region     = "${queue.region}"
}
`;
  }

  private generateRuleTerraform(rule: Rule, appName: string): string {
    const sanitizedRuleName = this.sanitizeName(rule.id);
    const sanitizedAppName = this.sanitizeName(appName);

    let ruleSpecificFields = '';
    switch (rule.ruleType) {
      case 'http':
        ruleSpecificFields = this.generateHttpRuleFields(rule.target);
        break;
      case 'amqp':
        ruleSpecificFields = this.generateAmqpRuleFields(rule.target);
        break;
      case 'amqp/external':
        ruleSpecificFields = this.generateAmqpExternalRuleFields(rule.target);
        break;
      case 'aws/kinesis':
        ruleSpecificFields = this.generateAwsKinesisRuleFields(rule.target);
        break;
      case 'aws/lambda':
        ruleSpecificFields = this.generateAwsLambdaRuleFields(rule.target);
        break;
      case 'aws/sqs':
        ruleSpecificFields = this.generateAwsSqsRuleFields(rule.target);
        break;
      case 'azure/function':
        ruleSpecificFields = this.generateAzureFunctionRuleFields(rule.target);
        break;
      case 'google/function':
        ruleSpecificFields = this.generateGoogleFunctionRuleFields(rule.target);
        break;
      case 'kafka':
        ruleSpecificFields = this.generateKafkaRuleFields(rule.target);
        break;
      case 'pulsar':
        ruleSpecificFields = this.generatePulsarRuleFields(rule.target);
        break;
      case 'zapier':
        ruleSpecificFields = this.generateZapierRuleFields(rule.target);
        break;
      default:
        console.warn(`Unsupported rule type: ${rule.ruleType}`);
        return '';
    }

    return `
resource "ably_rule" "${sanitizedAppName}_${sanitizedRuleName}" {
  app_id       = ably_app.${sanitizedAppName}.id
  status       = "${rule.status}"
  rule_type    = "${rule.ruleType}"
  request_mode = "${rule.requestMode}"
  source {
    channel_filter = "${rule.source.channelFilter.replace(/"/g, '\\"')}"
    type           = "${rule.source.type}"
  }
  ${ruleSpecificFields}
}
`;
  }

  private generateHttpRuleFields(target: any): string {
    return `
  target {
    url             = "${target.url}"
    format          = "${target.format}"
    headers         = ${JSON.stringify(target.headers)}
    signing_key_id  = "${target.signingKeyId || ''}"
    enveloped       = ${target.enveloped || false}
  }`;
  }

  private generateAmqpRuleFields(target: any): string {
    return `
  target {
    queue_id  = "${target.queueId}"
    format    = "${target.format}"
    enveloped = ${target.enveloped || false}
  }`;
  }

  private generateAmqpExternalRuleFields(target: any): string {
    return `
  target {
    url                = "${target.url}"
    routing_key        = "${target.routingKey}"
    mandatory_route    = ${target.mandatoryRoute}
    persistent_messages = ${target.persistentMessages}
    message_ttl        = ${target.messageTtl || 'null'}
    format             = "${target.format}"
    headers            = ${JSON.stringify(target.headers)}
    enveloped          = ${target.enveloped || false}
  }`;
  }

  private generateAwsKinesisRuleFields(target: any): string {
    return `
  target {
    region        = "${target.region}"
    stream_name   = "${target.streamName}"
    partition_key = "${target.partitionKey}"
    format        = "${target.format}"
    enveloped     = ${target.enveloped || false}
    authentication {
      authentication_mode = "${target.authentication.authenticationMode}"
      access_key_id       = "${target.authentication.accessKeyId || ''}"
      secret_access_key   = "${target.authentication.secretAccessKey || ''}"
      assume_role_arn     = "${target.authentication.assumeRoleArn || ''}"
    }
  }`;
  }

  private generateAwsLambdaRuleFields(target: any): string {
    return `
  target {
    region        = "${target.region}"
    function_name = "${target.functionName}"
    format        = "${target.format}"
    enveloped     = ${target.enveloped || false}
    authentication {
      authentication_mode = "${target.authentication.authenticationMode}"
      access_key_id       = "${target.authentication.accessKeyId || ''}"
      secret_access_key   = "${target.authentication.secretAccessKey || ''}"
      assume_role_arn     = "${target.authentication.assumeRoleArn || ''}"
    }
  }`;
  }

  private generateAwsSqsRuleFields(target: any): string {
    return `
  target {
    region          = "${target.region}"
    aws_account_id  = "${target.awsAccountId}"
    queue_name      = "${target.queueName}"
    format          = "${target.format}"
    enveloped       = ${target.enveloped || false}
    authentication {
      authentication_mode = "${target.authentication.authenticationMode}"
      access_key_id       = "${target.authentication.accessKeyId || ''}"
      secret_access_key   = "${target.authentication.secretAccessKey || ''}"
      assume_role_arn     = "${target.authentication.assumeRoleArn || ''}"
    }
  }`;
  }

  private generateAzureFunctionRuleFields(target: any): string {
    return `
  target {
    azure_app_id   = "${target.azureAppId}"
    function_name  = "${target.functionName}"
    format         = "${target.format}"
    headers        = ${JSON.stringify(target.headers)}
    signing_key_id = "${target.signingKeyId || ''}"
    enveloped      = ${target.enveloped || false}
  }`;
  }

  private generateGoogleFunctionRuleFields(target: any): string {
    return `
  target {
    region        = "${target.region}"
    project_id    = "${target.projectId}"
    function_name = "${target.functionName}"
    format        = "${target.format}"
    headers       = ${JSON.stringify(target.headers)}
    signing_key_id = "${target.signingKeyId || ''}"
    enveloped     = ${target.enveloped || false}
  }`;
  }

  private generateKafkaRuleFields(target: any): string {
    return `
  target {
    brokers     = ${JSON.stringify(target.brokers)}
    routing_key = "${target.routingKey}"
    format      = "${target.format}"
    enveloped   = ${target.enveloped || false}
    auth {
      sasl {
        mechanism = "${target.auth.sasl.mechanism}"
        username  = "${target.auth.sasl.username}"
        password  = "${target.auth.sasl.password}"
      }
    }
  }`;
  }

  private generatePulsarRuleFields(target: any): string {
    return `
  target {
    routing_key      = "${target.routingKey}"
    topic            = "${target.topic}"
    service_url      = "${target.serviceUrl}"
    tls_trust_certs  = ${JSON.stringify(target.tlsTrustCerts)}
    format           = "${target.format}"
    enveloped        = ${target.enveloped || false}
    authentication {
      mode  = "${target.authentication.mode}"
      token = "${target.authentication.token}"
    }
  }`;
  }

  private generateZapierRuleFields(target: any): string {
    return `
  target {
    url            = "${target.url}"
    headers        = ${JSON.stringify(target.headers)}
    signing_key_id = "${target.signingKeyId || ''}"
  }`;
  }

  private async generateTerraformForApp(app: App): Promise<string> {
    let terraform = this.generateAppTerraform(app);

    const keys = await this.getKeys(app.id);
    keys.forEach((key) => {
      terraform += this.generateKeyTerraform(key, app.name);
    });

    const namespaces = await this.getNamespaces(app.id);
    namespaces.forEach((namespace) => {
      terraform += this.generateNamespaceTerraform(namespace, app.name);
    });

    const queues = await this.getQueues(app.id);
    queues.forEach((queue) => {
      terraform += this.generateQueueTerraform(queue, app.name);
    });

    const rules = await this.getRules(app.id);
    rules.forEach((rule) => {
      terraform += this.generateRuleTerraform(rule, app.name);
    });

    return terraform;
  }

  public async run() {
    try {
      const apps = await this.getApps();
      if (apps.length === 0) {
        console.log('No apps found for this account.');
        return;
      }

      console.log('Found the following apps:');
      apps.forEach((app, index) => {
        console.log(`${index + 1}. ${app.name} (${app.id})`);
      });

      const answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: 'Do you want to proceed with generation?',
          default: true,
        },
      ]);

      if (answers.proceed) {
        const outputDir = path.join(process.cwd(), 'output');
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir);
        }

        for (const app of apps) {
          console.log(`Generating Terraform for app: ${app.name}`);
          const terraform = await this.generateTerraformForApp(app);
          const fileName = `${this.sanitizeName(app.name)}.tf`;
          fs.writeFileSync(path.join(outputDir, fileName), terraform);
          console.log(`Generated ${fileName}`);
        }

        console.log('Terraform generation complete.');
      } else {
        console.log('Generation cancelled.');
      }
    } catch (error) {
      console.error('An error occurred:', error);
      if (axios.isAxiosError(error) && error.response) {
        console.error('API Error:', error.response.data);
      }
    }
  }
}

const generator = new AblyTerraformGenerator();
generator.run();
