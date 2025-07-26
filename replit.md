# Chart Analysis Application

## Overview

This is a full-stack chart analysis application that combines React frontend with Express backend to analyze trading charts using AI-powered services. The application allows users to upload multiple trading chart images, automatically analyze them using GPT-4o, generate depth maps, and find similar charts through vector embeddings with automatic instrument detection and CLIP vector embeddings.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes (January 2025)

✓ **Enhanced Multi-File Upload**: Added support for uploading multiple chart images simultaneously for the same instrument
✓ **Automatic CLIP Embeddings**: Integrated automatic CLIP vector embedding generation on every upload for similarity search
✓ **Instrument Detection**: Added automatic instrument detection from filenames (XAUUSD, EURUSD, etc.) with manual override option
✓ **Session Tagging**: Added trading session support (Asia, London, NY, Sydney) for better chart organization
✓ **Database Schema Enhancement**: Extended charts table with instrument and session fields
✓ **Grouped Chart Display**: Added API endpoints for instrument-based chart grouping and filtering
✓ **Multi-Timeframe Bundle System**: Complete implementation of chart bundling for comprehensive analysis
✓ **Structured Bundle Analysis**: Enhanced GPT-4o prompts with structured multi-timeframe analysis returning prediction, session, and confidence data
✓ **Bundle Analysis UI**: Created dedicated bundle analysis panel with prediction visualization and detailed insights display
✓ **Enhanced Quick Analysis Pipeline**: Upgraded similarity search to include bundle context when similar charts belong to bundles
✓ **Multi-Timeframe Context Integration**: GPT-4o now receives complete bundle information for better predictions when analyzing individual charts

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack Query (React Query) for server state management
- **UI Components**: Shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens
- **Build Tool**: Vite with custom configuration for development and production

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **File Handling**: Multer for multipart form uploads
- **Database**: PostgreSQL with Drizzle ORM and Neon serverless hosting
- **AI Services**: Integration with OpenAI GPT-4o, CLIP, and MiDaS models
- **Session Management**: Connect-pg-simple for PostgreSQL session storage
- **Storage Layer**: DatabaseStorage class implementing IStorage interface for persistent data operations

### Key Components

#### Data Storage
- **Database**: PostgreSQL with three main tables:
  - `users`: User authentication data with username/password
  - `charts`: Chart metadata, file paths, CLIP embeddings, instrument, session, and timeframe information
  - `analysis_results`: GPT analysis results and similar chart references with confidence scores
- **File Storage**: Local filesystem storage for uploaded images and generated depth maps
- **ORM**: Drizzle ORM with Zod schema validation and automated timestamp handling
- **Storage Interface**: IStorage interface ensures consistent data operations across memory and database implementations

#### Authentication & Authorization
- Session-based authentication using Express sessions
- PostgreSQL session storage for persistence
- User registration and login system

#### AI Integration Pipeline
1. **Image Upload**: Charts uploaded via drag-and-drop or file selection
2. **Embedding Generation**: OpenCLIP ViT-H/14 generates 1024-dimensional vector embeddings for enhanced similarity search
3. **Depth Map Creation**: MiDaS model generates depth maps for pattern analysis
4. **GPT Analysis**: OpenAI GPT-4o analyzes charts with technical trading insights
5. **Bundle Analysis**: Multi-timeframe GPT-4o analysis with structured prompts for prediction, session timing, and confidence assessment
6. **Similarity Search**: Cosine similarity search with 1024D vectors to find related charts

## Data Flow

1. **Upload Flow**:
   - User selects timeframe and uploads chart image
   - File stored locally with metadata in database
   - Background processing generates embeddings and depth maps
   - GPT analysis triggered with similar charts context

2. **Analysis Flow**:
   - Chart image converted to base64 for GPT-4o Vision API
   - Similar charts retrieved using vector similarity search
   - Comprehensive technical analysis generated including trends, patterns, and trading insights
   - Results stored and displayed in analysis panel

3. **Dashboard Flow**:
   - Charts retrieved with optional timeframe filtering
   - Bulk operations for chart management
   - Real-time updates via React Query

## External Dependencies

### AI Services
- **OpenAI GPT-4o**: Chart analysis and technical insights
- **OpenCLIP ViT-H/14**: 1024-dimensional image embedding generation for enhanced similarity search
- **MiDaS Model**: Depth map generation for pattern analysis

### Database & Storage
- **Neon Database**: PostgreSQL hosting (@neondatabase/serverless)
- **Local File Storage**: Images and depth maps stored in server/uploads and server/depthmaps

### UI & Styling
- **Radix UI**: Accessible component primitives
- **Tailwind CSS**: Utility-first styling
- **Lucide React**: Icon library

## Deployment Strategy

### Development
- Vite dev server for frontend hot reloading
- TSX for running TypeScript Express server
- Database migrations via Drizzle Kit
- Environment variables for API keys and database URLs

### Production
- Frontend built with Vite and served as static files
- Backend bundled with esbuild for Node.js runtime
- PostgreSQL database with connection pooling
- File uploads handled via local filesystem (could be extended to cloud storage)

### Build Process
- `npm run build`: Creates production build of both frontend and backend
- Frontend assets output to `dist/public`
- Backend server bundled to `dist/index.js`
- Database schema managed through Drizzle migrations

The architecture follows a monorepo pattern with shared TypeScript schemas between frontend and backend, ensuring type safety across the full stack. The application is designed to be deployed as a single service with the Express server serving both API endpoints and static frontend assets.