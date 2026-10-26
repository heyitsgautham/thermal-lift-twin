// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import GlobalError from "@/app/global-error";
import RouteError from "@/app/error";
import { ErrorScreen } from "../error-screen";

afterEach(cleanup);

describe("ErrorScreen", () => {
  it("shows the error and reports it once as a render error", () => {
    const report = vi.fn(() => true);
    const error = new RangeError("No model for BGW-1");
    const { rerender } = render(<ErrorScreen error={error} retry={() => {}} report={report} />);
    rerender(<ErrorScreen error={error} retry={() => {}} report={report} />);
    expect(screen.getByRole("alert")).toHaveProperty("textContent", expect.stringContaining("This screen stopped on an error"));
    expect(screen.getByTestId("error-detail").textContent).toBe("No model for BGW-1");
    expect(report).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(error, "render");
  });

  it("shows the digest that matches the server log", () => {
    const error = Object.assign(new Error("An error occurred in the Server Components render."), { digest: "1823" });
    render(<ErrorScreen error={error} retry={() => {}} report={() => true} />);
    expect(screen.getByTestId("error-detail").textContent).toContain("(ref 1823)");
  });

  it("leaves the detail out for a thrown value that is not an Error", () => {
    render(<ErrorScreen error="nope" retry={() => {}} report={() => true} />);
    expect(screen.queryByTestId("error-detail")).toBeNull();
  });

  it("retries the screen and links back to the story", () => {
    const retry = vi.fn();
    render(<ErrorScreen error={new Error("x")} retry={retry} report={() => true} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Open the story" }).getAttribute("href")).toBe("/story");
  });
});

describe("error boundaries", () => {
  it("renders the error screen for a page error", () => {
    render(<RouteError error={new Error("page failed")} retry={() => {}} />);
    expect(screen.getByTestId("error-detail").textContent).toBe("page failed");
  });

  it("renders the error screen when the root layout fails", () => {
    // global-error renders its own <html>; React warns about nesting it in a div here.
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<GlobalError error={new Error("layout failed")} retry={() => {}} />);
    expect(screen.getByTestId("error-detail").textContent).toBe("layout failed");
    warn.mockRestore();
  });
});
