import { useCallback } from "react";
import {
  useWorkshopStore,
  type ChatMessage,
  type Project,
  type Session,
} from "../store/workshopStore";

export interface UseInterviewReturn {
  messages: ChatMessage[];
  project: Project | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  /** options.regenerateSection: para comandos / (solo tab MDD). */
  sendMessage: (message: string, options?: { regenerateSection?: number }) => Promise<void>;
}

export function useInterview(
  _projectId: string | null,
  activeTab?: string,
): UseInterviewReturn {
  const project = useWorkshopStore((s) => s.project);
  const session = useWorkshopStore((s) => s.session);
  const loading = useWorkshopStore((s) => s.loading);
  const error = useWorkshopStore((s) => s.error);
  const sendMessageStore = useWorkshopStore((s) => s.sendMessage);


  const activeTabNorm = activeTab ?? "mdd";
  const streamingUserMessage = useWorkshopStore((s) => s.streamingUserMessage);
  const streamingContent = useWorkshopStore((s) => s.streamingContent);
  const streamingTab = useWorkshopStore((s) => s.streamingTab);

  const baseMessages = (session?.chatLog ?? []).filter(
    (m) => (m.tab ?? "mdd") === activeTabNorm,
  );
  const messages =
    streamingUserMessage != null && (streamingTab ?? "mdd") === activeTabNorm
      ? [
        ...baseMessages,
        { role: "user" as const, content: streamingUserMessage, tab: activeTabNorm },
        {
          role: "assistant" as const,
          content: streamingContent ?? "",
          tab: activeTabNorm,
        },
      ]
      : baseMessages;

  const send = useCallback(
    (message: string, options?: { regenerateSection?: number }) =>
      sendMessageStore(message, activeTab, options),
    [sendMessageStore, activeTab],
  );

  return {
    messages,
    project,
    session,
    loading,
    error,
    sendMessage: send,
  };
}
