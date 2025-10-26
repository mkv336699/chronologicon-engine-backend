# Chronologicon Engine Backend - Database Setup

This backend has been converted to use PostgreSQL database instead of in-memory storage.

## Prerequisites

1. **PostgreSQL Database**: Install PostgreSQL (version 12 or higher)
2. **Node.js**: Version 16 or higher
3. **npm**: Package manager

## Database Setup

### 1. Create Database

```sql
-- Connect to PostgreSQL as superuser
CREATE DATABASE chronologicon;
CREATE USER chronologicon_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE chronologicon TO chronologicon_user;
```

### 2. Run Database Schema

```bash
# Connect to your database and run the schema
psql -U chronologicon_user -d chronologicon -f database_schema.sql
```

### 3. Environment Configuration

Create a `.env` file in the project root:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=chronologicon
DB_USER=chronologicon_user
DB_PASSWORD=your_password

# Server Configuration
PORT=3000
NODE_ENV=development
```

## Installation & Running

```bash
# Install dependencies
npm install

# Start the server
npm start

# Or for development with auto-reload
npm run dev
```

## Database Schema

The application uses the `HistoricalEvents` table with the following structure:

- `event_id` (UUID, Primary Key)
- `event_name` (VARCHAR(255), NOT NULL)
- `description` (TEXT, nullable)
- `start_date` (TIMESTAMPTZ, NOT NULL, indexed)
- `end_date` (TIMESTAMPTZ, NOT NULL, indexed)
- `duration_minutes` (INTEGER, generated column)
- `parent_event_id` (UUID, Foreign Key, nullable)
- `metadata` (JSONB, for additional data)

## Key Changes from In-Memory Version

1. **Database Storage**: All events are now stored in PostgreSQL
2. **Async Operations**: All database operations are asynchronous
3. **Generated Columns**: Duration is automatically calculated by the database
4. **Indexes**: Optimized queries with proper indexing
5. **JSONB Metadata**: Flexible metadata storage for additional event properties

## API Endpoints

All existing API endpoints remain the same:

- `GET /api/events` - Get all events
- `GET /api/events/:id` - Get specific event
- `POST /api/events` - Create new event
- `PUT /api/events/:id` - Update event
- `DELETE /api/events/:id` - Delete event
- `GET /api/gap-finder` - Find temporal gaps
- `GET /api/influence-spreader/:eventId` - Calculate event influence

## Sample Data

The application will automatically load sample data from `sample-data.csv` on startup. The CSV format has been updated to work with the new database schema:

- `researchValue` is now stored in the `metadata` JSONB field
- All other fields map directly to database columns

## Troubleshooting

1. **Database Connection Issues**: Check your `.env` file and ensure PostgreSQL is running
2. **Schema Errors**: Make sure you've run the `database_schema.sql` file
3. **Permission Issues**: Ensure the database user has proper permissions
4. **Port Conflicts**: Change the PORT in `.env` if 3000 is already in use

## Performance Considerations

- The database includes indexes on `start_date`, `end_date`, and `parent_event_id`
- Complex queries use optimized SQL with CTEs (Common Table Expressions)
- Connection pooling is configured for better performance
- Generated columns reduce application-level calculations
