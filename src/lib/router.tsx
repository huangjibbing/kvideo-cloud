import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

interface RouterValue {
  path: string;
  search: string;
  navigate: (to: string, options?: { replace?: boolean; keepScroll?: boolean }) => void;
}

const RouterContext = createContext<RouterValue | null>(null);

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState(() => ({
    path: window.location.pathname,
    search: window.location.search,
  }));

  useEffect(() => {
    const onPop = () => setLocation({ path: window.location.pathname, search: window.location.search });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string, options?: { replace?: boolean; keepScroll?: boolean }) => {
    const url = new URL(to, window.location.origin);
    if (url.origin !== window.location.origin) {
      window.location.href = to;
      return;
    }
    if (options?.replace) window.history.replaceState({}, '', url);
    else window.history.pushState({}, '', url);
    setLocation({ path: url.pathname, search: url.search });
    if (!options?.keepScroll) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const value = useMemo(() => ({ ...location, navigate }), [location, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter() {
  const value = useContext(RouterContext);
  if (!value) throw new Error('RouterProvider missing');
  return value;
}

export function useQuery() {
  const { search } = useRouter();
  return useMemo(() => new URLSearchParams(search), [search]);
}

interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
  children: React.ReactNode;
}

export function Link({ to, children, onClick, ...rest }: LinkProps) {
  const { navigate } = useRouter();
  return (
    <a
      href={to}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          rest.target === '_blank'
        ) {
          return;
        }
        event.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
