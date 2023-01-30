# world-id-analytics

Monitors events related to World ID verifications, both from the SDK and the Worldcoin app.

## Event Definitions

The following are the events consumed to determine total number of verifications.

Worldcoin app:

- `World ID verification success`: Successful verification from inside the app
- `WLD airdrop block claimed`: User claimed a share of $WLD, which requires a World ID verification
- `Airdrop level reward claimed`: User claimed an airdrop (BTC/ETH/USDC) inside the Worldcoin app

World ID:

- `onchain verification`: User performed verification via smart contract (E.g. Lens)
- `phone verification`: User performed verification via phone OTP (Twilio)

## API Endpoints

The project contains the following endpoints:

`/api/v1/webhook`: Accepts inbound events from the Alchemy Address Activity webhook. These are parsed and sent to PostHog.

`/api/v1/verifications`: Retrieves the total number of completed World ID verifications. Accepts a number of filters, defined below.

Request Body:
| Parameter | Type | Description |
|-------------------|---------|--------------------------------------------------------------------------------------------------------|
| start | string | ISO timestamp of where to begin summing events (inclusive) |
| end | string | ISO timestamp of where to stop summing events (exclusive) |
| filter_wld_claims | boolean |Exclude $WLD claims in the event total? Defaults to `false` |
| filter_airdrops | boolean | Exclude airdrop claims (BTC/ETH/USDC) in the event total? Defaults to `false` |
| filter_phones | boolean | Exclude phone verifications in the event total? Defaults to `false` |
| filter_tests | boolean | Exclude test verifications (localhost, @worldcoin.org, etc.) from the event total? Defaults to `false` |

Example:

```json
{
  "start": "2022-01-01",
  "end": "2023-02-01",
  "filter_wld_claims": false,
  "filter_airdrops": false,
  "filter_phones": false,
  "filter_tests": true
}
```

Response Body:

```json
{
  "success": boolean,
  "count": number
}
```
