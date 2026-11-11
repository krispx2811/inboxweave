import type { Button, ButtonMessage } from "./types.ts";

/**
 * Instagram message bodies for Comment-to-DM. Pure.
 * "button" is Instagram's button template. If private replies reject it
 * (checked in Task 1 of the plan), switch to "generic": one card, one button.
 */
export const TEMPLATE_STYLE: "button" | "generic" = "button";

function toGraphButton(b: Button) {
  return b.type === "postback"
    ? { type: "postback", title: b.title, payload: b.payload }
    : { type: "web_url", title: b.title, url: b.url };
}

export function templateMessage(msg: ButtonMessage, style: "button" | "generic" = TEMPLATE_STYLE) {
  const button = toGraphButton(msg.button);
  if (style === "generic") {
    const title = msg.text.slice(0, 80);
    const subtitle = msg.text.slice(80, 160);
    const element = subtitle ? { title, subtitle, buttons: [button] } : { title, buttons: [button] };
    return { attachment: { type: "template", payload: { template_type: "generic", elements: [element] } } };
  }
  return {
    attachment: { type: "template", payload: { template_type: "button", text: msg.text, buttons: [button] } },
  };
}
