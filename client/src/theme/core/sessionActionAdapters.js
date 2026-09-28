export function createSessionBlockActions(blocks, mutate) {
  const findBlock = (blockId) => blocks.find((block) => block.id === blockId)
  return {
    completeBlock: (blockId, payload) => mutate(findBlock(blockId), 'complete', payload),
    submitBlock: (blockId, response) => mutate(findBlock(blockId), 'submit', { response }),
  }
}
