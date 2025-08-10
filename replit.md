# Chart Analysis Application

## Overview
This full-stack application provides AI-powered analysis of trading charts with unified analysis architecture. Users can upload multiple chart images through either Dashboard or Chat interfaces, which are analyzed using advanced AI models like GPT-4o with strict JSON schema enforcement. Key capabilities include generating Structure/Intensity Maps, Edge Maps, and Gradient Maps, finding similar charts via server-side CLIP vector embeddings, and supporting multi-timeframe analysis bundles. The unified analysis service ensures route parity between Dashboard and Chat endpoints, providing comprehensive technical insights and pattern recognition for trading charts.

## User Preferences
Preferred communication style: Simple, everyday language.
Trading panel: Minimized by default for optimal chart viewing.
Dashboard default view: Condensed accordion layout with all sections closed by default.
System Prompt Interface: Three-view toggle interface (Inject, Current Prompt, Default Prompt) with dynamic AI integration.
Theme Preferences: Dark mode toggle implemented across all pages with automatic system preference detection and localStorage persistence.

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
- **Analysis Integration**: Unified analysis endpoints for route parity between Dashboard and Chat interfaces.

### Backend Architecture
- **Framework**: Express.js with TypeScript.
- **File Handling**: Multer for multipart form uploads.
- **Database**: PostgreSQL with Drizzle ORM and Neon serverless hosting.
- **AI Services Integration**: OpenAI GPT-4o, server-side CLIP embeddings, and Structure/Intensity Maps.
- **Session Management**: Connect-pg-simple for PostgreSQL session storage.
- **Storage Layer**: DatabaseStorage class implementing IStorage interface.
- **Unified Analysis Service**: Central analysis pipeline with strict JSON schema enforcement and route parity.

### Key Components
#### Data Storage
- **Database**: PostgreSQL with `users`, `charts`, `analysis_results`, `watchlists`, and `chart_layouts` tables.
- **File Storage**: Local filesystem for uploaded images and generated analysis maps.
- **ORM**: Drizzle ORM with Zod schema validation.
- **Storage Interface**: IStorage interface for consistent data operations.

#### Authentication & Authorization
- Session-based authentication using Express sessions with PostgreSQL storage.

#### AI Integration Pipeline (Unified Analysis Service)
1.  **Image Upload**: Supports single and multi-file uploads with route parity across Dashboard and Chat.
2.  **Server-side Embedding Generation**: CLIP embeddings generated server-side for 1024-dimensional vector similarity search.
3.  **Advanced Image Processing**: Automatic generation of Structure/Intensity Maps (renamed from Depth Maps), Edge Maps (Laplacian), and Gradient Maps (Sobel filter).
4.  **Dynamic System Prompts**: Three-view interface allowing custom prompt injection with real-time GPT-4o integration.
5.  **GPT Analysis**: OpenAI GPT-4o analyzes charts with comprehensive visual data and technical insights using strict JSON schema enforcement.
6.  **Bundle Analysis**: Multi-timeframe GPT-4o analysis for structured predictions with ordered frame context.
7.  **RAG Context**: Cosine similarity search using 1024D vectors for historical pattern matching.
8.  **Schema Validation**: Strict JSON response validation with 422 error codes for invalid responses.
9.  **Non-destructive Processing**: All image processing preserves original files while generating analysis maps.

## External Dependencies
### AI Services
- **OpenAI GPT-4o**: For chart analysis and technical insights with strict JSON schema enforcement.
- **Server-side CLIP Embeddings**: For 1024-dimensional image embedding generation and RAG similarity search.
- **Structure/Intensity Maps**: Sharp-based image processing for pattern strength analysis (replaces MiDaS dependency).

### Database & Storage
- **Neon Database**: PostgreSQL hosting.

### UI & Styling
- **Radix UI**: Accessible component primitives.
- **Tailwind CSS**: Utility-first styling with full dark mode support.
- **Lucide React**: Icon library.
- **Theme System**: React Context-based dark/light mode with smooth transitions and persistent preferences.