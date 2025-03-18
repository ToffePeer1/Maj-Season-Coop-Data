# Egg Inc Contract Analyzer

This tool helps me collect and analyze performance data from Egg Inc contracts and coops. I built it to track player contributions, calculate scoring metrics, and analyze seasonal contracts from the game.

## What This Does

I created this to track how players perform in Egg Inc's cooperative contracts. It pulls data from both the EggCoop API and a custom endpoint to get comprehensive information about contracts, coops, and player performance. The main things it does:

- Fetches contract data filtered by game seasons
- Collects coop data for these contracts
- Calculates detailed performance metrics for each player
- Processes data with rate limiting to avoid API issues
- Saves progress regularly to prevent data loss

## Features

- **Season-based filtering**: I can specify which game seasons to analyze
- **Rate-limited processing**: The tool handles API requests carefully to avoid getting blocked
- **Performance metrics**: Calculates contribution factors, time bonuses, and teamwork scores
- **Buff history tracking**: Records how players used boosts during contracts
- **Batch processing**: Processes data in configurable batches with progress tracking

## Setup and Installation

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file with:
   ```
   MAJ_ENDPOINT=your_endpoint_url_here
   ```

## How to Use

Edit the configuration values at the top of `index.js`:

```javascript
// Define these two variables to filter the contracts
// The starting season is inclusive, the ending season is exclusive
const startingSeason = "winter_2025";
const endingSeason = "spring_2025";

// Whether or not to clear the coops file before writing new coops
const clearCoopsFile = true;

// Number of coops to process before writing to file
const SAVE_INTERVAL = 50;
```

Then run the script:

```
node index.js
```

The tool will show a progress bar and estimated completion time as it works. It creates three main data files:

- `files/contractList.json` - List of contracts in the selected seasons
- `files/coopList.json` - List of cooperatives for these contracts
- `files/coops.json` - Detailed data including player contributions and calculated metrics

## Key Metrics

I calculate several performance metrics for each player:

- **Contribution Factor**: Based on how many eggs they shipped compared to their "fair share"
- **Completion Time Bonus**: Rewards finishing contracts faster
- **Teamwork Score**: Based on how players use boosts to help the team
- **Combined Score (CS)**: Final calculated score incorporating all factors

## Components

- **index.js**: Main script that coordinates the whole process
- **eggcoop.js**: Functions for interacting with the EggCoop API
- **maj.js**: Functions for retrieving cooperative data
- **tools.js**: Utility functions for calculations and data processing

## Rate Limiting

I've built in rate limiting to be respectful to the APIs. You can adjust these settings in `index.js`:

```javascript
const remainingProcessedCoops = await processCoopsWithRateLimiting(
    coops,
    seasonalContracts,
    existingCoops,
    {
        maxParallel: 3, // Process 3 coops in parallel
        requestDelay: 500, // 500ms staggered delay between requests in a batch
        batchDelay: 2000, // 2 second delay between batches
        includeBuffHistory: true, // Enable buff history fetching
        buffHistoryDelay: 300, // 300ms delay between buff history requests
    }
);
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

Thanks to the EggCoop API for providing access to the contract data. Special thanks to "the kind Whale" mentioned in the code comments for the coop duration calculation function.
