import { describe, it, expect, beforeEach } from 'vitest'
import {
  getThinkingContent,
  setThinkingContent,
  appendThinkingContent,
  removeThinkingContent,
  clearAllThinkingContent,
  getMessageIdsWithThinking,
  hasThinkingContent,
  getThinkingContentCount,
  thinkingContentStore,
} from '../../src/store/thinking-content'

describe('thinking-content store', () => {
  beforeEach(() => {
    clearAllThinkingContent()
  })

  describe('setThinkingContent / getThinkingContent', () => {
    it('should store and retrieve thinking content by message ID', () => {
      setThinkingContent('msg-1', 'thinking about expenses...')
      expect(getThinkingContent('msg-1')).toBe('thinking about expenses...')
    })

    it('should return empty string for non-existent message', () => {
      expect(getThinkingContent('non-existent')).toBe('')
    })

    it('should overwrite existing content', () => {
      setThinkingContent('msg-1', 'first')
      setThinkingContent('msg-1', 'second')
      expect(getThinkingContent('msg-1')).toBe('second')
    })
  })

  describe('appendThinkingContent', () => {
    it('should append to existing content', () => {
      setThinkingContent('msg-1', 'hello')
      appendThinkingContent('msg-1', ' world')
      expect(getThinkingContent('msg-1')).toBe('hello world')
    })

    it('should create content if not exists', () => {
      appendThinkingContent('msg-1', 'first chunk')
      expect(getThinkingContent('msg-1')).toBe('first chunk')
    })

    it('should support streaming simulation', () => {
      appendThinkingContent('msg-1', 'chunk1')
      appendThinkingContent('msg-1', 'chunk2')
      appendThinkingContent('msg-1', 'chunk3')
      expect(getThinkingContent('msg-1')).toBe('chunk1chunk2chunk3')
    })
  })

  describe('removeThinkingContent', () => {
    it('should remove content for a message', () => {
      setThinkingContent('msg-1', 'content')
      removeThinkingContent('msg-1')
      expect(getThinkingContent('msg-1')).toBe('')
    })

    it('should not throw for non-existent message', () => {
      expect(() => removeThinkingContent('non-existent')).not.toThrow()
    })
  })

  describe('clearAllThinkingContent', () => {
    it('should remove all content', () => {
      setThinkingContent('msg-1', 'a')
      setThinkingContent('msg-2', 'b')
      clearAllThinkingContent()
      expect(getThinkingContentCount()).toBe(0)
      expect(getThinkingContent('msg-1')).toBe('')
      expect(getThinkingContent('msg-2')).toBe('')
    })
  })

  describe('hasThinkingContent', () => {
    it('should return true for messages with content', () => {
      setThinkingContent('msg-1', 'content')
      expect(hasThinkingContent('msg-1')).toBe(true)
    })

    it('should return false for non-existent messages', () => {
      expect(hasThinkingContent('non-existent')).toBe(false)
    })

    it('should return false for empty content', () => {
      setThinkingContent('msg-1', '')
      expect(hasThinkingContent('msg-1')).toBe(false)
    })
  })

  describe('getMessageIdsWithThinking', () => {
    it('should return all message IDs with content', () => {
      setThinkingContent('msg-1', 'a')
      setThinkingContent('msg-2', 'b')
      setThinkingContent('msg-3', '')
      const ids = getMessageIdsWithThinking()
      expect(ids).toContain('msg-1')
      expect(ids).toContain('msg-2')
      // msg-3 has empty string but is still in the map
      expect(ids).toHaveLength(3)
    })
  })

  describe('getThinkingContentCount', () => {
    it('should return the number of entries', () => {
      expect(getThinkingContentCount()).toBe(0)
      setThinkingContent('msg-1', 'a')
      expect(getThinkingContentCount()).toBe(1)
      setThinkingContent('msg-2', 'b')
      expect(getThinkingContentCount()).toBe(2)
    })
  })

  describe('thinkingContentStore (named export)', () => {
    it('should expose all methods via the store object', () => {
      thinkingContentStore.set('msg-1', 'test')
      expect(thinkingContentStore.get('msg-1')).toBe('test')
      expect(thinkingContentStore.has('msg-1')).toBe(true)
      thinkingContentStore.append('msg-1', ' more')
      expect(thinkingContentStore.get('msg-1')).toBe('test more')
      thinkingContentStore.remove('msg-1')
      expect(thinkingContentStore.has('msg-1')).toBe(false)
    })
  })
})
