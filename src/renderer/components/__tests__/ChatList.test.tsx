/**
 * Unit tests for ChatList component's new chat creation integration
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ipcRenderer } from 'electron';
import ChatList from '../ChatList';

// Mock Electron IPC
const mockIpcRenderer = {
  invoke: jest.fn(),
};

jest.mock('electron', () => ({
  ipcRenderer: mockIpcRenderer,
}));

// Mock CSS imports
jest.mock('../../styles/components/ChatList.css', () => ({}));

describe('ChatList - New Chat Integration', () => {
  const mockOnSelectConversation = jest.fn();
  const mockOnCreateNewChat = jest.fn();
  const mockConversations = [
    {
      id: '1609459200001',
      title: 'First conversation',
      lastMessageAt: 1609459200001,
    },
    {
      id: '1609459200002',
      title: 'Second conversation',
      lastMessageAt: 1609459200002,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockIpcRenderer.invoke.mockResolvedValue(mockConversations);
  });

  describe('Initial Loading', () => {
    it('should load conversations on mount', async () => {
      render(
        <ChatList
          onSelectConversation={mockOnSelectConversation}
          onCreateNewChat={mockOnCreateNewChat}
          currentConversationId="1609459200001"
        />
      );

      await waitFor(() => {
        expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('get-conversations');
      });

      expect(screen.getByText('First conversation')).toBeInTheDocument();
      expect(screen.getByText('Second conversation')).toBeInTheDocument();
    });

    it('should show loading state initially', () => {
      render(
        <ChatList
          onSelectConversation={mockOnSelectConversation}
          onCreateNewChat={mockOnCreateNewChat}
          currentConversationId="1609459200001"
        />
      );

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('should show empty state when no conversations exist', async () => {
      mockIpcRenderer.invoke.mockResolvedValueOnce([]);

      render(
        <ChatList
          onSelectConversation={mockOnSelectConversation}
          onCreateNewChat={mockOnCreateNewChat}
          currentConversationId=""
        />
      );

      await waitFor(() => {
        expect(screen.getByText('No conversations yet')).toBeInTheDocument();
      });
    });
  });

  describe('New Chat Integration', () => {
    it('should reload conversations when currentConversationId changes', async () => {
      const { rerender } = render(
        <ChatList
          onSelectConversation={mockOnSelectConversation}
          onCreateNewChat={mockOnCreateNewChat}
          currentConversationId="1609459200001"
        />
      );

      // Wait for initial load
      await waitFor(() => {
        expect(mockIpcRenderer.invoke).toHaveBeenCalledTimes(1);
      });

      // Change the currentConversationId to simulate new chat creation
      rerender(
        <ChatList
          onSelectConversation={mockOnSelectConversation}
          onCreateNewChat={mockOnCreateNewChat}
          currentConversationId="1609459200003"
        />
      );

      await waitFor(() => {
        expect(mockIpcRenderer.invoke).toHaveBeenCalledTimes(2);
        expect(mockIpcRenderer.invoke).toHaveBeenNthCalledWith(2, 'get-conversations');
      });
    });

    it('should not reload conversations when currentConversationId is empty', async () => {
      const { rerender } = render(
        <ChatList
          onSelectConversation={mockOnSelectConversation}
          onCreateNewChat={mockOnCreateNewChat}
          currentConversationId=""
        />
      );

      // Wait for initial load
      await waitFor(() => {
        expect(mockIpcRenderer.invoke).toHaveBeenCalledTimes(1);
      });

      // Change to empty string - should not trigger reload
      rerender(
        <ChatList
          onSelectConversation={mockOnSelectConversation}
          onCreateNewChat={mockOnCreateNewChat}
          currentConversationId=""
        />
      );

      // Should still only be called once
      expect(mockIpcRenderer.invoke).toHaveBeenCalledTimes(1);
    });

    it('should reload conversations when switching from empty to valid currentConversationId', async () => {
      const { rerender } = render(
        <ChatList
          onSelectConversation={mockOnSelectConversation}
          onCreateNewChat={mockOnCreateNewChat}
          currentConversationId=""
        />
      );

      // Wait for initial load
      await waitFor(() => {
        expect(mockIpcRenderer.invoke).toHaveBeenCalledTimes(1);
      });

      // Change to valid conversation ID
      rerender(
        <ChatList
          onSelectConversation={mockOnSelectConversation}
          onCreateNewChat={mockOnCreateNewChat}
          currentConversationId="1609459200003"
        />
      );

      await waitFor(() => {
        expect(mockIpcRenderer.invoke).toHaveBeenCalledTimes(2);
      });
    });

    it('should handle new conversation appearing in the list', async () => {
      // Start with initial conversations
      render(
        <ChatList
          onSelectConversation={mockOnSelectConversation}
          onCreateNewChat={mockOnCreateNewChat}
          currentConversationId="1609459200001"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('First conversation')).toBeInTheDocument();
        expect(screen.getByText('Second conversation')).toBeInTheDocument();
      });

      // Mock new conversation list with additional conversation
      const newConversations = [
        ...mockConversations,
        {
          id: '1609459200003',
          title: 'New conversation created',
          lastMessageAt: 1609459200003,
        },
      ];

      mockIpcRenderer.invoke.mockResolvedValueOnce(newConversations);

      // Manually trigger reload by changing currentConversationId
      const { rerender } = render(
        <ChatList
          onSelectConversation={mockOnSelectConversation}
          onCreateNewChat={mockOnCreateNewChat}
          currentConversationId="1609459200003"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('New conversation created')).toBeInTheDocument();
      });
    });
  });

  describe('Conversation Selection', () => {
    it('should highlight current conversation', async () => {
      render(
        <ChatList
          onSelectConversation={mockOnSelectConversation}
          onCreateNewChat={mockOnCreateNewChat}
          currentConversationId="1609459200001"
        />
      );

      await waitFor(() => {
        const activeItem = screen.getByText('First conversation').closest('.chat-item');
        expect(activeItem).toHaveClass('active');
      });
    });

    it('should call onSelectConversation when conversation is clicked', async () => {
      render(
        <ChatList
          onSelectConversation={mockOnSelectConversation}
          onCreateNewChat={mockOnCreateNewChat}
          currentConversationId="1609459200001"
        />
      );

      await waitFor(() => {
        const conversationItem = screen.getByText('Second conversation');
        fireEvent.click(conversationItem);
      });

      expect(mockOnSelectConversation).toHaveBeenCalledWith('1609459200002');
    });

    it('should log conversation selection for debugging', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      
      render(
        <ChatList
          onSelectConversation={mockOnSelectConversation}
          onCreateNewChat={mockOnCreateNewChat}
          currentConversationId="1609459200001"
        />
      );

      await waitFor(() => {
        const conversationItem = screen.getByText('Second conversation');
        fireEvent.click(conversationItem);
      });

      expect(consoleLogSpy).toHaveBeenCalledWith('Chat item clicked:', '1609459200002');
      expect(consoleLogSpy).toHaveBeenCalledWith('Current conversation ID:', '1609459200001');

      consoleLogSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should handle IPC errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const mockError = new Error('Failed to load conversations');
      
      mockIpcRenderer.invoke.mockRejectedValueOnce(mockError);

      render(
        <ChatList
          onSelectConversation={mockOnSelectConversation}
          onCreateNewChat={mockOnCreateNewChat}
          currentConversationId="1609459200001"
        />
      );

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load conversations:', mockError);
      });

      // Should still show empty state or loading completed
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();

      consoleErrorSpy.mockRestore();
    });

    it('should handle malformed conversation data', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const malformedConversations = [
        {
          id: '1609459200001',
          title: { invalid: 'object title' }, // This should be a string
          lastMessageAt: 1609459200001,
        },
      ];

      mockIpcRenderer.invoke.mockResolvedValueOnce(malformedConversations);

      render(
        <ChatList
          onSelectConversation={mockOnSelectConversation}
          onCreateNewChat={mockOnCreateNewChat}
          currentConversationId="1609459200001"
        />
      );

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Conversation at index 0 has title as object:',
          { invalid: 'object title' }
        );
      });

      // Should fallback to date-based title
      await waitFor(() => {
        expect(screen.getByText(/Conversation \d+\/\d+\/\d+/)).toBeInTheDocument();
      });

      consoleErrorSpy.mockRestore();
    });

    it('should handle non-array conversation data', async () => {
      mockIpcRenderer.invoke.mockResolvedValueOnce('invalid data');

      render(
        <ChatList
          onSelectConversation={mockOnSelectConversation}
          onCreateNewChat={mockOnCreateNewChat}
          currentConversationId="1609459200001"
        />
      );

      await waitFor(() => {
        // Should not crash and show empty state
        expect(screen.getByText('No conversations yet')).toBeInTheDocument();
      });
    });
  });

  describe('Conversation Sorting and Display', () => {
    it('should sort conversations by most recent first', async () => {
      const unsortedConversations = [
        {
          id: '1609459200001',
          title: 'Older conversation',
          lastMessageAt: 1609459200001,
        },
        {
          id: '1609459200003',
          title: 'Newest conversation',
          lastMessageAt: 1609459200003,
        },
        {
          id: '1609459200002',
          title: 'Middle conversation',
          lastMessageAt: 1609459200002,
        },
      ];

      mockIpcRenderer.invoke.mockResolvedValueOnce(unsortedConversations);

      render(
        <ChatList
          onSelectConversation={mockOnSelectConversation}
          onCreateNewChat={mockOnCreateNewChat}
          currentConversationId="1609459200001"
        />
      );

      await waitFor(() => {
        const conversations = screen.getAllByRole('button');
        expect(conversations[0]).toHaveTextContent('Newest conversation');
        expect(conversations[1]).toHaveTextContent('Middle conversation');
        expect(conversations[2]).toHaveTextContent('Older conversation');
      });
    });

    it('should display formatted time for conversations', async () => {
      const now = Date.now();
      const oneHourAgo = now - 3600000;
      const oneDayAgo = now - 86400000;

      const timeTestConversations = [
        {
          id: '1',
          title: 'Recent conversation',
          lastMessageAt: now - 60000, // 1 minute ago
        },
        {
          id: '2',
          title: 'Hour old conversation',
          lastMessageAt: oneHourAgo,
        },
        {
          id: '3',
          title: 'Day old conversation',
          lastMessageAt: oneDayAgo,
        },
      ];

      mockIpcRenderer.invoke.mockResolvedValueOnce(timeTestConversations);

      render(
        <ChatList
          onSelectConversation={mockOnSelectConversation}
          onCreateNewChat={mockOnCreateNewChat}
          currentConversationId="1"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('1m ago')).toBeInTheDocument();
        expect(screen.getByText('1h ago')).toBeInTheDocument();
        expect(screen.getByText('1d ago')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels for conversation items', async () => {
      render(
        <ChatList
          onSelectConversation={mockOnSelectConversation}
          onCreateNewChat={mockOnCreateNewChat}
          currentConversationId="1609459200001"
        />
      );

      await waitFor(() => {
        const conversationItem = screen.getByLabelText('Conversation: First conversation');
        expect(conversationItem).toBeInTheDocument();
        expect(conversationItem).toHaveAttribute('role', 'button');
        expect(conversationItem).toHaveAttribute('tabIndex', '0');
      });
    });
  });
});