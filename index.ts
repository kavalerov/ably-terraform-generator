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

  private generateAppTerraform(app: App): string {
    return `
resource "ably_app" "${app.id}" {
  name = "${app.name}"
}
`;
  }

  private generateKeyTerraform(key: Key, appId: string): string {
    const capability = JSON.stringify(key.capability).replace(/"/g, '\\"');
    return `
resource "ably_api_key" "${key.id}" {
  app_id = ably_app.${appId}.id
  name = "${key.name}"
  capability = jsonencode(${capability})
}
`;
  }

  private generateNamespaceTerraform(
    namespace: Namespace,
    appId: string
  ): string {
    return `
resource "ably_namespace" "${namespace.id}" {
  app_id = ably_app.${appId}.id
  id = "${namespace.id}"
  authenticated = ${namespace.authenticated}
  persisted = ${namespace.persisted}
  persist_last = ${namespace.persistLast}
  push_enabled = ${namespace.pushEnabled}
  tls_only = ${namespace.tlsOnly}
}
`;
  }

  private generateQueueTerraform(queue: Queue, appId: string): string {
    return `
resource "ably_queue" "${queue.id}" {
  app_id = ably_app.${appId}.id
  name = "${queue.name}"
  ttl = ${queue.ttl}
  max_length = ${queue.maxLength}
  region = "${queue.region}"
}
`;
  }

  private generateRuleTerraform(rule: Rule, appId: string): string {
    const target = JSON.stringify(rule.target).replace(/"/g, '\\"');
    return `
resource "ably_rule_${rule.ruleType.replace('/', '_')}" "${rule.id}" {
  app_id = ably_app.${appId}.id
  status = "${rule.status}"
  request_mode = "${rule.requestMode}"
  source = {
    channel_filter = "${rule.source.channelFilter}"
    type = "${rule.source.type}"
  }
  target = jsonencode(${target})
}
`;
  }

  private async generateTerraformForApp(app: App): Promise<string> {
    let terraform = this.generateAppTerraform(app);

    const keys = await this.getKeys(app.id);
    keys.forEach((key) => {
      terraform += this.generateKeyTerraform(key, app.id);
    });

    const namespaces = await this.getNamespaces(app.id);
    namespaces.forEach((namespace) => {
      terraform += this.generateNamespaceTerraform(namespace, app.id);
    });

    const queues = await this.getQueues(app.id);
    queues.forEach((queue) => {
      terraform += this.generateQueueTerraform(queue, app.id);
    });

    const rules = await this.getRules(app.id);
    rules.forEach((rule) => {
      terraform += this.generateRuleTerraform(rule, app.id);
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
          const fileName = `${app.name}.tf`;
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
