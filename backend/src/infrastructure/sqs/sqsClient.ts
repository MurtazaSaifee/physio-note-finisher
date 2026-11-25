import { SQSClient } from "@aws-sdk/client-sqs";

let _client: SQSClient | undefined;

export function getSqsClient(): SQSClient {
  if (!_client) {
    const region = process.env.AWS_REGION;

    if (!region) {
      throw new Error("AWS_REGION is required");
    }

    _client = new SQSClient({ region });
  }

  return _client;
}

export function resetSqsClient(): void {
  _client = undefined;
}
