import ChatBox from "../components/ChatBox";

export default function ChatPage({ loading, chatHistory, onSendChat }) {
  return (
    <div className="max-w-3xl">
      <ChatBox history={chatHistory} onSend={onSendChat} loading={loading} />
    </div>
  );
}
