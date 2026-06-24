type ChatTabNavigation = {
  navigate: (screen: "Chat", params: { screen: "ConversationList" }) => void
}

type PreventableTabPressEvent = {
  preventDefault: () => void
}

export function handleChatTabPress(event: PreventableTabPressEvent, navigation: ChatTabNavigation) {
  event.preventDefault()
  navigation.navigate("Chat", { screen: "ConversationList" })
}
