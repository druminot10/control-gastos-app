import { useLayoutEffect, useRef } from "react";
import legacyTemplate from "./legacy-template.html?raw";

const legacyMarkup = new DOMParser().parseFromString(legacyTemplate, "text/html").body;
legacyMarkup.querySelectorAll("script").forEach((script) => script.remove());

export default function App() {
  const appContainer = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = appContainer.current;
    if (!container) return;

    container.replaceChildren(
      ...Array.from(legacyMarkup.childNodes, (node) => node.cloneNode(true)),
    );
    void import("./app.js");
  }, []);

  return <div ref={appContainer} />;
}
