import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TextInput, SelectInput } from "./FormField";

describe("TextInput", () => {
  it("renders the label and an input", () => {
    render(<TextInput label="Email" placeholder="you@kompta.local" />);
    expect(screen.getByText("Email")).toBeTruthy();
    expect(screen.getByPlaceholderText("you@kompta.local")).toBeTruthy();
  });

  it("forwards value and fires onChange", () => {
    const onChange = vi.fn();
    render(<TextInput label="Nom" value="" onChange={onChange} placeholder="nom" />);
    fireEvent.change(screen.getByPlaceholderText("nom"), { target: { value: "Amina" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("passes through the type attribute", () => {
    render(<TextInput label="Mot de passe" type="password" placeholder="pwd" />);
    const input = screen.getByPlaceholderText("pwd") as HTMLInputElement;
    expect(input.type).toBe("password");
  });
});

describe("SelectInput", () => {
  it("renders options", () => {
    render(
      <SelectInput label="Type">
        <option value="tontine">Tontine</option>
        <option value="ong">ONG</option>
      </SelectInput>,
    );
    expect(screen.getByText("Tontine")).toBeTruthy();
    expect(screen.getByText("ONG")).toBeTruthy();
  });
});
