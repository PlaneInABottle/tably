import { handleChatTabPress } from "./chatTabPress"

describe("handleChatTabPress", () => {
  it("opens the chat conversation list from the bottom tab", () => {
    const event = { preventDefault: jest.fn() }
    const navigation = { navigate: jest.fn() }

    handleChatTabPress(event, navigation)

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(navigation.navigate).toHaveBeenCalledWith("Chat", { screen: "ConversationList" })
  })
})
