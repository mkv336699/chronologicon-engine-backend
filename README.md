# Chronologicon Engine Backend

A sophisticated temporal data analysis engine that identifies gaps between events and calculates event influence spreading patterns.

## Features

### 🕒 Temporal Gap Finder
- Identifies gaps between events in chronological order
- Categorizes gaps by severity (critical, high, medium, low)
- Provides gap analysis and recommendations
- Supports gap simulation for event rescheduling

### 🌊 Event Influence Spreader
- Calculates how events influence each other through parent-child relationships
- Provides influence network visualization
- Supports influence simulation and impact analysis
- Generates recommendations based on influence patterns

### 📊 Data Management
- CSV data import and validation
- Event CRUD operations
- Comprehensive error handling
- Real-time statistics and analytics

## API Endpoints

### Events
- `GET /api/events` - Get all events (with sorting and pagination)
- `GET /api/events/:id` - Get specific event
- `POST /api/events` - Create new event
- `PUT /api/events/:id` - Update event
- `DELETE /api/events/:id` - Delete event
- `GET /api/events/:id/children` - Get child events
- `GET /api/events/range/:start/:end` - Get events in date range
- `GET /api/events/statistics` - Get collection statistics

### Temporal Gap Finder
- `GET /api/gap-finder` - Find all temporal gaps
- `GET /api/gap-finder/critical` - Find critical gaps only
- `GET /api/gap-finder/analysis` - Detailed gap analysis
- `POST /api/gap-finder/simulate` - Simulate gap filling

### Event Influence Spreader
- `GET /api/influence-spreader/:eventId` - Calculate influence for specific event
- `GET /api/influence-spreader/analysis/global` - Global influence analysis
- `POST /api/influence-spreader/simulate` - Simulate influence changes
- `GET /api/influence-spreader/network/:eventId` - Get influence network data

### System
- `GET /health` - Health check
- `GET /` - API information

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. For development with auto-reload:
```bash
npm run dev
```

## Data Format

Events are expected to have the following structure:
```json
{
  "eventId": "unique-id",
  "eventName": "Event Name",
  "startDate": "2023-01-01T10:00:00Z",
  "endDate": "2023-01-01T11:30:00Z",
  "parentId": "parent-event-id" | null,
  "researchValue": 8,
  "description": "Event description"
}
```

## Sample Data

The system comes with sample data that demonstrates:
- Event hierarchies with parent-child relationships
- Temporal gaps of various sizes
- Overlapping events
- Malformed data handling
- Different research values and their influence

## Architecture

### Core Components

1. **Event Model** - Validates and manages event data
2. **EventCollection** - Manages collections of events and relationships
3. **Temporal Gap Finder** - Identifies and analyzes gaps between events
4. **Event Influence Spreader** - Calculates influence propagation through event networks

### Key Algorithms

#### Gap Finding Algorithm
- Sorts events chronologically
- Calculates gaps between consecutive events
- Categorizes gaps by severity based on duration
- Provides recommendations for gap optimization

#### Influence Spreading Algorithm
- Uses recursive depth-first traversal
- Applies exponential decay with depth (0.7^depth)
- Considers both parent and child relationships
- Calculates total influence impact

## Error Handling

The system includes comprehensive error handling:
- Input validation using Joi schemas
- Graceful handling of malformed data
- Detailed error logging with Winston
- User-friendly error responses

## Logging

All operations are logged using Winston with:
- Error logs (errors.log)
- Combined logs (combined.log)
- Console output for development

## Performance Considerations

- Efficient data structures using Maps for O(1) lookups
- Pagination support for large datasets
- Configurable depth limits for influence calculations
- Memory-efficient gap analysis algorithms

## Testing

Run tests with:
```bash
npm test
```

## Contributing

1. Follow the existing code structure
2. Add comprehensive error handling
3. Include logging for important operations
4. Update documentation for new features

## License

ISC License - See package.json for details
