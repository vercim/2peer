import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

const versionMeta = document.querySelector('meta[name="version"]');
const version = versionMeta ? versionMeta.getAttribute("content") : "";

ReactDOM.createRoot(document.getElementById("root")).render(
  <App version={version} />,
);
