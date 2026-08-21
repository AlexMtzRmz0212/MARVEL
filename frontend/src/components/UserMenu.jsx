import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { DeleteAccountDialog } from "../auth/DeleteAccountDialog";

/** "peter@example.com" reads as "peter" in a header six characters wide. */
function label(user) {
  return user.display_name || user.email.split("@")[0];
}

export function UserMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setIsOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  if (!user) {
    return (
      <NavLink
        to="/login"
        className="meta border border-hairline-strong px-3 py-1.5 text-ink-dim transition-colors hover:bg-raised hover:text-ink"
      >
        Sign in
      </NavLink>
    );
  }

  return (
    <>
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          aria-haspopup="menu"
          className="meta max-w-[12rem] truncate px-3 py-1.5 text-ink-dim transition-colors hover:text-ink"
        >
          {label(user)}
        </button>

        {isOpen && (
          <div
            role="menu"
            className="hairline absolute right-0 top-full z-40 mt-1 w-60 border bg-surface p-3 shadow-lg"
          >
            <p className="meta truncate">{user.email}</p>
            <p className="mt-2 text-xs leading-relaxed text-ink-faint">
              Signing out leaves this device empty. Your orders and progress
              stay in your account.
            </p>
            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                setIsOpen(false);
                await signOut();
                navigate("/");
              }}
              className="meta mt-3 w-full border border-hairline-strong px-3 py-1.5 text-ink transition-colors hover:bg-raised"
            >
              Sign out
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                setIsDeleting(true);
              }}
              className="meta hairline mt-3 w-full border-t pt-3 text-left text-danger transition-colors hover:text-ink"
            >
              Delete account
            </button>
          </div>
        )}
      </div>

      {isDeleting && (
        <DeleteAccountDialog onClose={() => setIsDeleting(false)} />
      )}
    </>
  );
}
