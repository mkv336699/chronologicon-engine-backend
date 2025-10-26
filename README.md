# Chronologicon Engine Backend

A temporal data analysis engine for tracking events, analyzing gaps, and understanding influence patterns between related events.

## What It Does

Chronologicon helps you make sense of time-based data by:
- Finding gaps between events that might need attention
- Showing how events influence each other over time
- Organizing events in meaningful timelines
- Providing insights about your temporal data

## API Reference

### Events API

Manage your event data with these endpoints:

```
GET    /api/events              # List all events (supports sorting & pagination)
GET    /api/events/:id          # Get a specific event by ID
POST   /api/events              # Create a new event
PUT    /api/events/:id          # Update an existing event
DELETE /api/events/:id          # Remove an event
GET    /api/events/search       # Search events by name and date range
```

### Timeline API

Work with event timelines:

```
GET    /api/timeline            # Get events within a date range
GET    /api/timeline/:rootEventId  # Get hierarchical timeline for an event
```

### Insights API

Discover patterns and relationships in your event data:

```
GET    /api/insights/event-influence        # Find how events influence each other
                                             # Supports sourceEventId & targetEventId

GET    /api/insights/event-influence-path   # Find shortest path between events
                                             # Requires sourceEventId & targetEventId

GET    /api/insights/temporal-gaps          # Find gaps between events
                                             # Requires startDate & endDate
```

## Getting Started

Just follow these steps to get up and running:

1. Install what you need:
```bash
npm install
```

2. Fire up the server:
```bash
npm start
```

3. For development (with auto-reload):
```bash
npm run dev
```

## Event Data Structure

Here's what an event looks like in our system:

```json
{
  "eventId": "abc123",
  "eventName": "Team Brainstorming Session",
  "startDate": "2023-01-01T10:00:00Z",
  "endDate": "2023-01-01T11:30:00Z",
  "parentId": "xyz789",  // or null if no parent
  "description": "Quarterly planning session with design team"
}
```

## Sample Data

We've included some example data to help you get started. It shows:
- How events can be connected in parent-child relationships
- Various gaps between events (some small, some large)
- Events that overlap in time
- How to handle different types of events

## How It Works

### Main Components

- **Event Model** - Handles all the event data validation and storage
- **Timeline Builder** - Creates hierarchical views of related events
- **Gap Analyzer** - Finds and measures the spaces between events
- **Influence Calculator** - Shows how events affect each other over time

### Under the Hood

When you're looking for gaps between events, we:
1. Sort everything by time
2. Look for spaces between when one event ends and the next begins
3. Calculate how big those gaps are
4. Show you where the biggest gaps are

For finding influence between events, we:
1. Build a network of events based on their timing
2. Use a breadth-first search to find the shortest path
3. Calculate how long each event takes
4. Show you the most efficient path between events

## Error Handling

We've built this to be pretty robust:
- Validation checks make sure your data is in the right format
- Helpful error messages tell you exactly what went wrong
- Everything important gets logged so you can troubleshoot

## Performance

We've optimized for speed and efficiency:
- Fast lookups for event data
- Pagination so you don't load too much at once
- Smart algorithms that don't waste resources

## Testing

Run the test suite with:
```bash
npm test
```

## Contributing

Want to help improve this project? Here's how:
1. Stick to the coding style we're using
2. Add good error handling to your code
3. Document any new features you add
4. Write tests for your changes

## License

ISC License - Check package.json for details
