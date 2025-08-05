# Chart Analysis Application

## Overview
This full-stack application provides AI-powered analysis of trading charts. Users can upload multiple chart images, which are then automatically analyzed using advanced AI models like GPT-4o. Key capabilities include generating depth, edge, and gradient maps, finding similar charts via CLIP vector embeddings, and supporting multi-timeframe analysis bundles. The project aims to provide comprehensive technical insights and pattern recognition for trading charts, enhancing a user's analytical capabilities in financial markets.

## User Preferences
Preferred communication style: Simple, everyday language.
Trading panel: Minimized by default for optimal chart viewing.
Dashboard default view: Condensed accordion layout with all sections closed by default.
System Prompt Interface: Three-view toggle interface (Inject, Current Prompt, Default Prompt) with dynamic AI integration.

## System Architecture
### Frontend Architecture
- **Framework**: React 18 with TypeScript.
- **Routing**: Wouter.
- **State Management**: TanStack Query (React Query).
- **UI Components**: Shadcn/ui (built on Radix UI).
- **Trading Interface**: Professional TradingView-style components with drawing tools, watchlists, and trading panels.
- **Styling**: Tailwind CSS with custom design tokens.
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
2.  **Embedding Generation**: OpenCLIP ViT-H/14 generates 1024-dimensional vector embeddings for similarity search.
3.  **Advanced Image Processing**: Automatic generation of Depth Maps (MiDaS), Edge Maps (Sobel), and Gradient Maps (price slope analysis).
4.  **Dynamic System Prompts**: Three-view interface allowing custom prompt injection with real-time GPT-4o integration.
5.  **GPT Analysis**: OpenAI GPT-4o analyzes charts with comprehensive visual data and technical insights using customizable system prompts.
6.  **Bundle Analysis**: Multi-timeframe GPT-4o analysis for structured predictions with prompt customization.
7.  **Similarity Search**: Cosine similarity search using 1024D vectors.

## External Dependencies
### AI Services
- **OpenAI GPT-4o**: For chart analysis and technical insights.
- **OpenCLIP ViT-H/14**: For 1024-dimensional image embedding generation.
- **MiDaS Model**: For depth map generation.

### Database & Storage
- **Neon Database**: PostgreSQL hosting.

### UI & Styling
- **Radix UI**: Accessible component primitives.
- **Tailwind CSS**: Utility-first styling.
- **Lucide React**: Icon library.