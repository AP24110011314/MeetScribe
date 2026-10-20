import { createBrowserRouter } from "react-router-dom";

import App from "./App";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { Meetings } from "./pages/Meetings";
import { NotFound } from "./pages/NotFound";
import { Register } from "./pages/Register";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      { path: "login", element: <Login /> },
      { path: "register", element: <Register /> },
      {
        element: <ProtectedRoute />,
        children: [{ path: "meetings", element: <Meetings /> }],
      },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
