import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("boom");
  return <div>ok</div>;
}

describe("ErrorBoundary", () => {
  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <div>hello</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("hello")).toBeTruthy();
  });

  it("catches a render error and shows the fallback UI instead of crashing", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText("KOMPTA")).toBeTruthy();
    expect(screen.getByText(/erreur est survenue/i)).toBeTruthy();
    expect(screen.queryByText("ok")).toBeNull();
    spy.mockRestore();
  });

  it("recovers after Réessayer if the child no longer throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    let shouldThrow = true;
    function ControlledBomb() {
      return <Bomb shouldThrow={shouldThrow} />;
    }

    const { rerender } = render(
      <ErrorBoundary>
        <ControlledBomb />
      </ErrorBoundary>
    );

    expect(screen.getByText(/erreur est survenue/i)).toBeTruthy();

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: /Réessayer/i }));
    rerender(
      <ErrorBoundary>
        <ControlledBomb />
      </ErrorBoundary>
    );

    expect(screen.getByText("ok")).toBeTruthy();
    spy.mockRestore();
  });
});
