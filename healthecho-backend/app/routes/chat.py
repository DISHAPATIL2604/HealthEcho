from fastapi import APIRouter

from app.core.schemas import ChatRequest, ChatResponse
from app.modules.analyzer import chat_follow_up

router = APIRouter(prefix="", tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    history = [turn.model_dump() for turn in req.history]
    answer = chat_follow_up(req.question, req.analysis_summary, history)
    return ChatResponse(answer=answer)
