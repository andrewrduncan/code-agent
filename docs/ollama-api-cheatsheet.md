# Ollama API Cheat Sheet

A quick reference guide for all Ollama API endpoints. Base URL: `http://localhost:11434`

## Model Management

### List Models
```http
GET /api/tags
```
Lists all available models on the system.

### Pull Model
```http
POST /api/pull
{
  "name": "llama2"
}
```
Download a model from the Ollama library.

### Push Model
```http
POST /api/push
{
  "name": "username/modelname:latest"
}
```
Push a model to a model library.

### Delete Model
```http
DELETE /api/delete
{
  "name": "llama2"
}
```
Remove a model from the system.

### Copy Model
```http
POST /api/copy
{
  "source": "llama2",
  "destination": "llama2-backup"
}
```
Create a copy of a model.

### Create Model
```http
POST /api/create
{
  "name": "modelname",
  "modelfile": "FROM llama2..."
}
```
Create a new model using a Modelfile.

### Show Model Details
```http
POST /api/show
{
  "name": "llama2"
}
```
Show details about a model including modelfile, template, parameters, and license.

## Generation & Chat

### Generate Response
```http
POST /api/generate
{
  "model": "llama2",
  "prompt": "Why is the sky blue?",
  "system": "You are a helpful assistant",
  "template": "{{ .Prompt }}",  // optional
  "context": [],                // optional
  "options": {                  // optional
    "temperature": 0.7,
    "top_p": 0.9,
    "top_k": 40,
    "seed": 42
  }
}
```
Generate a response from a prompt.

### Chat Completion
```http
POST /api/chat
{
  "model": "llama2",
  "messages": [
    {
      "role": "user",
      "content": "Hello, how are you?"
    }
  ],
  "stream": true,              // optional
  "options": {                 // optional
    "temperature": 0.7,
    "top_p": 0.9,
    "top_k": 40
  }
}
```
Have a chat conversation with the model.

### Embeddings
```http
POST /api/embeddings
{
  "model": "llama2",
  "prompt": "Here is some text to embed"
}
```
Generate embeddings from a prompt.

## Common Parameters

### Generation Options
- `temperature` (0.0 - 1.0): Controls randomness
- `top_p` (0.0 - 1.0): Nucleus sampling threshold
- `top_k` (1 - 100): Number of tokens to consider
- `seed` (integer): Random seed for reproducibility
- `num_predict` (integer): Maximum number of tokens to generate
- `stop` (string[]): Stop sequences to end generation
- `repeat_penalty` (0.0 - 2.0): Penalty for repeated tokens
- `presence_penalty` (0.0 - 2.0): Penalty for token presence
- `frequency_penalty` (0.0 - 2.0): Penalty for token frequency

### Response Format
```typescript
{
  "model": string,      // Name of the model
  "created_at": string, // ISO timestamp
  "response": string,   // Generated text
  "done": boolean,      // Whether generation is complete
  "context": number[],  // Token context for continued generation
  "total_duration": number, // Total processing time in nanoseconds
  "load_duration": number,  // Model load time in nanoseconds
  "prompt_eval_count": number, // Number of prompt tokens processed
  "eval_count": number,       // Number of tokens generated
  "eval_duration": number     // Generation time in nanoseconds
}
```

## Error Handling
- All errors return a JSON response with an `error` field
- HTTP status codes indicate the type of error:
  - `400`: Bad Request
  - `404`: Model Not Found
  - `500`: Internal Server Error

## Best Practices
1. Always check if the model is loaded before sending requests
2. Use streaming for long-form content generation
3. Implement proper error handling
4. Set appropriate timeouts for requests
5. Consider rate limiting for production use 