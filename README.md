# Ably Terraform Generator CLI

This CLI tool generates Terraform configurations for your Ably resources. It uses the Ably Control API to fetch information about your apps, keys, namespaces, queues, and rules, and then generates corresponding Terraform files.

## Features

- Fetches all apps associated with your Ably account
- Generates Terraform configurations for:
  - Apps
  - API Keys
  - Namespaces
  - Queues
  - Rules (including various rule types)
- Interactive command-line interface
- Outputs separate .tf files for each app

## Prerequisites

- Node.js (version 14 or later recommended)
- npm (usually comes with Node.js)
- An Ably account and API key with access to the Control API

## Installation

1. Clone this repository:

   ```
   git clone https://github.com/yourusername/ably-terraform-generator.git
   cd ably-terraform-generator
   ```

2. Install dependencies:
   ```
   npm install
   ```

## Usage

1. Set your Ably Control API token as an environment variable:

   For Unix-based systems (Linux, macOS):

   ```
   export ABLY_ACCOUNT_TOKEN=your_token_here
   ```

   For Windows Command Prompt:

   ```
   set ABLY_ACCOUNT_TOKEN=your_token_here
   ```

   For Windows PowerShell:

   ```
   $env:ABLY_ACCOUNT_TOKEN="your_token_here"
   ```

2. Run the CLI tool:

   ```
   npm start
   ```

3. The tool will display a list of your Ably apps and ask for confirmation before generating the Terraform files.

4. Once confirmed, it will generate .tf files in the `output` directory, one for each of your Ably apps.

## Generated Files

The tool generates a separate .tf file for each Ably app in your account. Each file includes Terraform resource definitions for:

- The app itself
- API keys associated with the app
- Namespaces defined for the app
- Queues set up for the app
- Rules (webhooks, integrations) configured for the app

## Terraform Usage

To use the generated Terraform files:

1. Ensure you have Terraform installed on your system.

2. Add the Ably provider configuration to your Terraform setup. You can create a `providers.tf` file with the following content:

   ```hcl
   terraform {
     required_providers {
       ably = {
         source = "ably/ably"
       }
     }
   }

   provider "ably" {}
   ```

3. Initialize Terraform:

   ```
   terraform init
   ```

4. You can then use standard Terraform commands like `terraform plan` and `terraform apply` to manage your Ably resources.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the Apache License, Version 2.0 - see the [LICENSE](LICENSE) file for details.

## Disclaimer

This tool is not officially associated with Ably. Use at your own risk and always review the generated Terraform configurations before applying them to your infrastructure.
