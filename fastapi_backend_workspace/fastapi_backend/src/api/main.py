import os
import uuid
from fastapi import FastAPI, HTTPException, Request, Depends, status, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import openai

# PUBLIC_INTERFACE
class Message(BaseModel):
    """A chat message from the user or bot."""
    sender: str = Field(..., description="Who sent the message: 'user' or 'bot'.")
    text: str = Field(..., description="Content of the message.")
    timestamp: Optional[str] = Field(None, description="ISO8601 timestamp (client- or server-generated).")

# PUBLIC_INTERFACE
class ChatRequest(BaseModel):
    """Schema for incoming chat from the frontend."""
    message: str = Field(..., description="User message to the chatbot.")
    session_id: Optional[str] = Field(None, description="Session ID if continuing a previous session.")

# PUBLIC_INTERFACE
class ChatResponse(BaseModel):
    """Schema for chat response sent to the frontend."""
    response: str = Field(..., description="Chatbot's response to the message.")
    session_id: str = Field(..., description="Session ID for tracking the context.")
    history: List[Message] = Field(default_factory=list, description="Full chat history for this session.")

# PUBLIC_INTERFACE
class SessionInfo(BaseModel):
    """Info about a user session."""
    session_id: str = Field(..., description="Unique identifier for the chat session.")
    history: List[Message] = Field(default_factory=list, description="Chat history for the session.")

# In-memory store for sessions. Replace with persistent db in prod.
sessions: Dict[str, List[Message]] = {}

# Load OpenAI API key (set as env variable OPENAI_API_KEY for real integration)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if OPENAI_API_KEY:
    openai.api_key = OPENAI_API_KEY

app = FastAPI(
    title="AI Chatbot Backend",
    description="REST API for chat messages and bot responses. Integrates with OpenAI GPT. Handles user session and chat history management.",
    version="0.1.0",
    openapi_tags=[
        {"name": "chat", "description": "Endpoints for user-bot chat interaction"},
        {"name": "session", "description": "Session and user management"}
    ]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# PUBLIC_INTERFACE
@app.get("/", tags=["default"])
def health_check():
    """Health check endpoint for the backend."""
    return {"message": "Healthy"}

# ----- Session Management -----

# PUBLIC_INTERFACE
@app.post("/session/create", response_model=SessionInfo, summary="Create a new chat session", tags=["session"])
def create_session():
    """
    Create a new chat session (returns new session_id and empty history).
    """
    session_id = str(uuid.uuid4())
    sessions[session_id] = []
    return SessionInfo(session_id=session_id, history=[])

# PUBLIC_INTERFACE
@app.get("/session/{session_id}", response_model=SessionInfo, summary="Get session chat history", tags=["session"])
def get_session(session_id: str):
    """
    Get the chat history for a session.
    """
    history = sessions.get(session_id)
    if history is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionInfo(session_id=session_id, history=history)

# PUBLIC_INTERFACE
@app.delete("/session/{session_id}", response_model=dict, summary="Delete a session and its chat history", tags=["session"])
def delete_session(session_id: str):
    """
    Delete the chat session and all its messages.
    """
    if session_id in sessions:
        del sessions[session_id]
        return {"success": True}
    else:
        raise HTTPException(status_code=404, detail="Session not found")

# ----- Chatbot Endpoint -----

# PUBLIC_INTERFACE
@app.post("/chat", response_model=ChatResponse, summary="Send a message to the chatbot and get AI response", tags=["chat"])
async def chat(
    request: ChatRequest = Body(..., description="User message and optional session ID")
):
    """
    Send a message to the chatbot and receive an AI-generated response.
    
    - If session_id is not provided, a new session is created.
    - The full session history is returned in the response.
    """
    user_message = request.message.strip()
    if not user_message:
        raise HTTPException(status_code=400, detail="Message is required.")
        
    # Session handling
    session_id = request.session_id or str(uuid.uuid4())
    if session_id not in sessions:
        sessions[session_id] = []
    history: List[Message] = sessions[session_id]

    # Add user message to history
    user_msg = Message(sender="user", text=user_message)
    history.append(user_msg)

    # Call GPT for bot response
    bot_reply = await generate_gpt_reply(history)

    bot_msg = Message(sender="bot", text=bot_reply)
    history.append(bot_msg)
    # Limit history size (simple fix for memory)
    if len(history) > 50:
        history = history[-50:]
        sessions[session_id] = history
    return ChatResponse(response=bot_reply, session_id=session_id, history=history)

# PUBLIC_INTERFACE
async def generate_gpt_reply(history: List[Message]) -> str:
    """
    Generates an AI response using OpenAI's GPT for the given chat history.
    If no key is set, returns a mocked response.
    """
    # Construct prompt or messages
    messages = [{"role": "system", "content": "You are a helpful AI assistant."}]
    for msg in history:
        messages.append({
            "role": "user" if msg.sender == "user" else "assistant",
            "content": msg.text
        })
    if OPENAI_API_KEY:
        try:
            # Using ChatCompletion API from OpenAI
            completion = await openai.AsyncOpenAI().chat.completions.create(
                model="gpt-3.5-turbo",
                messages=messages,
                max_tokens=256,
                temperature=0.7,
            )
            reply = completion.choices[0].message.content
        except Exception as e:
            reply = f"(Error with OpenAI API: {e})"
    else:
        # Mocked fallback for dev/testing
        if history:
            reply = f"(OpenAI API not configured) Echo: {history[-1].text[:100]}"
        else:
            reply = "(OpenAI API not configured) Hello!"
    return reply

# PUBLIC_INTERFACE
@app.get("/openapi.json", include_in_schema=False)
def get_openapi():
    """Get OpenAPI schema for this backend (for frontend integration)."""
    return app.openapi()

# Example Note: To use OpenAI integration, set OPENAI_API_KEY in your environment.

