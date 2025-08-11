# Chart Analysis Application

## Overview
This full-stack application provides AI-powered analysis of trading charts. Users can upload multiple chart images, which are then automatically analyzed using advanced AI models like GPT-4o. Key capabilities include generating depth, edge, and gradient maps, finding similar charts via CLIP vector embeddings, and supporting multi-timeframe analysis bundles. The project aims to provide comprehensive technical insights and pattern recognition for trading charts, enhancing a user's analytical capabilities in financial markets.

## User Preferences
Preferred communication style: Simple, everyday language.
Trading panel: Minimized by default for optimal chart viewing.
Dashboard default view: Condensed accordion layout with all sections closed by default.
System Prompt Interface: Three-view toggle interface (Inject, Current Prompt, Default Prompt) with dynamic AI integration.
Theme Preferences: Dark mode toggle implemented across all pages with automatic system preference detection and localStorage persistence.

## Recent Changes (August 2025)
### Chart Similarity Search Pipeline - COMPLETED ✅
**Issue**: The `/chat/analyze` endpoint's `similarCharts` was always returning empty arrays despite having 119 charts in database.

**Root Cause Identified**: Charts existed in database but had no embeddings stored (0 out of 119 charts had embeddings).

**Solution Implemented**:
1. **Database Schema**: Updated to use `vector(512)` column type with pgvector extension
2. **Embedding Service**: Configured CLIP (Transformers.js) model producing reliable 512-dimensional embeddings  
3. **Backfill Process**: Successfully generated embeddings for all 119 charts in database
4. **Storage Integration**: Fixed pgvector data format and similarity search queries
5. **Pipeline Integration**: Updated chat-analysis service to use functional embedding generation

**Result**: Similarity search now returns relevant charts with meaningful similarity scores (87-100% similarity for related charts). The `/chat/analyze` endpoint `similarCharts` field now populates correctly for RAG-enhanced analysis.

## System Architecture
### Frontend Architecture
- **Framework**: React 18 with TypeScript.
- **Routing**: Wouter.
- **State Management**: TanStack Query (React Query).
- **UI Components**: Shadcn/ui (built on Radix UI).
- **Trading Interface**: Professional TradingView-style components with drawing tools, watchlists, and trading panels.
- **Styling**: Tailwind CSS with custom design tokens and full dark mode support.
- **Theme System**: Custom React Context-based theme management with persistent localStorage and system preference detection.
- **Build Tool**: Vite.

### Backend Architecture
- **Framework**: Express.js with TypeScript.
- **File Handling**: Multer for multipart form uploads.
- **Database**: PostgreSQL with Drizzle ORM and Neon serverless hosting.
- **AI Services Integration**: OpenAI GPT-4o, CLIP, and MiDaS models.
- **Session Management**: Connect-pg-simple for PostgreSQL session storage.
- **Storage Layer**: DatabaseStorage class implementing IStorage interface.

### Key Components
#### Data Storage
- **Database**: PostgreSQL with `users`, `charts`, `analysis_results`, `watchlists`, and `chart_layouts` tables.
- **File Storage**: Local filesystem for uploaded images and generated analysis maps.
- **ORM**: Drizzle ORM with Zod schema validation.
- **Storage Interface**: IStorage interface for consistent data operations.

#### Authentication & Authorization
- Session-based authentication using Express sessions with PostgreSQL storage.

#### AI Integration Pipeline
1.  **Image Upload**: Supports single and multi-file uploads.
2.  **Embedding Generation**: CLIP (Transformers.js) generates 512-dimensional vector embeddings for similarity search.
3.  **Advanced Image Processing**: Automatic generation of Depth Maps (MiDaS), Edge Maps (Sobel), and Gradient Maps (price slope analysis).
4.  **Dynamic System Prompts**: Three-view interface allowing custom prompt injection with real-time GPT-4o integration.
5.  **GPT Analysis**: OpenAI GPT-4o analyzes charts with comprehensive visual data and technical insights using customizable system prompts.
6.  **Bundle Analysis**: Multi-timeframe GPT-4o analysis for structured predictions with prompt customization.
7.  **Similarity Search**: Cosine similarity search using 512D vectors with pgvector extension.

## External Dependencies
### AI Services
- **OpenAI GPT-4o**: For chart analysis and technical insights.
- **CLIP (Transformers.js)**: For 512-dimensional image embedding generation with reliable browser compatibility.
- **MiDaS Model**: For depth map generation.

### Database & Storage
- **Neon Database**: PostgreSQL hosting.

### UI & Styling
- **Radix UI**: Accessible component primitives.
- **Tailwind CSS**: Utility-first styling with full dark mode support.
- **Lucide React**: Icon library.
- **Theme System**: React Context-based dark/light mode with smooth transitions and persistent preferences.