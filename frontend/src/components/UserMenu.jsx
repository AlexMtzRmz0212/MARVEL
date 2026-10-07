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
        className="label border-2 border-on-masthead px-3 py-2 text-on-masthead transition-colors hover:bg-on-masthead hover:text-masthead"
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
          className="label max-w-[12rem] truncate px-3 py-2.5 text-on-masthead-dim transition-colors hover:text-on-masthead"
        >
          {label(user)}
        </button>

        {isOpen && (
          <div
            role="menu"
            className="floating bubble animate-popup-in absolute right-0 top-full z-40 mt-4 w-64 p-3 text-ink"
          >
            <p className="meta truncate">{user.email}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-dim">
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
              className="btn mt-3 w-full"
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
              className="btn btn-danger mt-2 w-full"
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
