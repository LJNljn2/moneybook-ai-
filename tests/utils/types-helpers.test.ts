import { describe, it, expect } from 'vitest'
import {
  getModelNames,
  isThinkingModel,
  getThinkingModels,
  migrateModels,
} from '../../src/types'
import type { AiPlatform, ModelConfig } from '../../src/types'

describe('ModelConfig helpers', () => {
  const mockPlatform: AiPlatform = {
    id: 'test',
    name: 'Test Platform',
    baseUrl: 'https://api.test.com/v1',
    models: [
      { name: 'model-a', supportsThinking: false },
      { name: 'model-b', supportsThinking: true },
      { name: 'model-c', supportsThinking: false },
      { name: 'model-d', supportsThinking: true },
    ],
    isCustom: false,
  }

  describe('getModelNames', () => {
    it('should return all model names as string array', () => {
      const names = getModelNames(mockPlatform)
      expect(names).toEqual(['model-a', 'model-b', 'model-c', 'model-d'])
    })

    it('should return empty array for platform with no models', () => {
      const empty: AiPlatform = { ...mockPlatform, models: [] }
      expect(getModelNames(empty)).toEqual([])
    })
  })

  describe('isThinkingModel', () => {
    it('should return true for models with supportsThinking: true', () => {
      expect(isThinkingModel(mockPlatform, 'model-b')).toBe(true)
      expect(isThinkingModel(mockPlatform, 'model-d')).toBe(true)
    })

    it('should return false for models with supportsThinking: false', () => {
      expect(isThinkingModel(mockPlatform, 'model-a')).toBe(false)
      expect(isThinkingModel(mockPlatform, 'model-c')).toBe(false)
    })

    it('should return false for non-existent model name', () => {
      expect(isThinkingModel(mockPlatform, 'non-existent')).toBe(false)
    })
  })

  describe('getThinkingModels', () => {
    it('should return only models with supportsThinking: true', () => {
      const thinking = getThinkingModels(mockPlatform)
      expect(thinking).toHaveLength(2)
      expect(thinking.map(m => m.name)).toEqual(['model-b', 'model-d'])
    })

    it('should return empty array when no thinking models', () => {
      const noThinking: AiPlatform = {
        ...mockPlatform,
        models: [
          { name: 'a', supportsThinking: false },
          { name: 'b', supportsThinking: false },
        ],
      }
      expect(getThinkingModels(noThinking)).toEqual([])
    })
  })

  describe('migrateModels', () => {
    it('should convert string array to ModelConfig array with supportsThinking: false', () => {
      const result = migrateModels(['deepseek-chat', 'gpt-4o'])
      expect(result).toEqual([
        { name: 'deepseek-chat', supportsThinking: false },
        { name: 'gpt-4o', supportsThinking: false },
      ])
    })

    it('should pass through ModelConfig objects unchanged', () => {
      const input: ModelConfig[] = [
        { name: 'deepseek-reasoner', supportsThinking: true },
        { name: 'deepseek-chat', supportsThinking: false },
      ]
      const result = migrateModels(input)
      expect(result).toEqual(input)
    })

    it('should handle mixed string and ModelConfig array', () => {
      const result = migrateModels([
        'plain-model',
        { name: 'thinking-model', supportsThinking: true },
      ])
      expect(result).toEqual([
        { name: 'plain-model', supportsThinking: false },
        { name: 'thinking-model', supportsThinking: true },
      ])
    })

    it('should return empty array for empty input', () => {
      expect(migrateModels([])).toEqual([])
    })
  })
})
