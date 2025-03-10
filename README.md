# Code Agent - Your AI-Powered Coding Assistant

Code Agent is a powerful VS Code extension that brings the capabilities of local LLMs (Large Language Models) directly into your development environment. Powered by Ollama, it provides an intelligent coding assistant that helps developers write, review, and improve code without relying on cloud-based services.

## Features

- 🤖 **Local LLM Integration**: Seamlessly connects with Ollama to run AI models locally on your machine
- 💬 **Interactive Chat Interface**: Engage in natural conversations about your code
- 🔄 **Dual Operation Modes**:
  - Chat Mode: For general coding discussions and queries
  - Agent Mode: For more focused, task-oriented assistance
- 🎯 **Model Selection**: Choose from available Ollama models to suit your needs
- 🔒 **Privacy-First**: All processing happens locally on your machine
- 🎨 **Modern UI**: Clean and intuitive interface built with Preact

## Prerequisites

- Visual Studio Code 1.85.0 or higher
- [Ollama](https://ollama.ai/) installed on your system
- Node.js and npm for development

## Installation

1. Install Ollama from [ollama.ai](https://ollama.ai)
2. Install the Code Agent extension from the VS Code marketplace
3. Make sure Ollama is running on your system

## Configuration

1. Open VS Code settings
2. Search for "Code Agent"
3. Configure available settings:
   - Model selection
   - Operation mode preferences
   - Other customization options

## Usage

1. Open the Code Agent panel in VS Code
2. Select your preferred model from the available Ollama models
3. Choose between Chat and Agent mode based on your needs
4. Start interacting with the AI assistant through the chat interface

## Development Setup

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/code-agent.git
   cd code-agent
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development version:
   - Press F5 in VS Code to launch the extension in debug mode
   - Make changes to the code and reload the window to see updates

## Building

```bash
npm run compile
```

## Testing

```bash
npm run test
```

## Project Structure

- `src/`
  - `components/` - UI components built with Preact
  - `webview/` - Webview implementation
  - `types/` - TypeScript type definitions
  - `utils/` - Utility functions
  - `OllamaService.ts` - Ollama integration service
  - `ModelManager.ts` - Model management functionality
  - `ChatViewProvider.ts` - Chat interface provider
  - `SettingsViewProvider.ts` - Settings interface provider
  - `extension.ts` - Main extension entry point

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[MIT License](LICENSE)

## Support

If you encounter any issues or have questions:
1. Check the [Known Issues](#known-issues) section
2. File an issue on the GitHub repository
3. Reach out to the development team

## Known Issues

- Please check the GitHub issues page for current known issues

## Release Notes

### 1.0.0
- Initial release
- Basic chat interface
- Ollama integration
- Model selection support
- Dual mode operation (Chat/Agent) 