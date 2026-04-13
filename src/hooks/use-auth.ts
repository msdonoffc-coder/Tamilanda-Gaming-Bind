import { useGetMe, getGetMeQueryKey, useLogin, useRegister, useLogout } from "@workspace/api-client-react";
import { setAuthToken } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";

export function useAuth() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const hasToken = !!localStorage.getItem("auth_token");

  const { data: user, isLoading, error } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
      enabled: hasToken,
      staleTime: 60_000,
    }
  });

  const loginMutation = useLogin();
  const registerMutation = useRegister();
  const logoutMutation = useLogout();

  const login = async (data: any) => {
    const res = await loginMutation.mutateAsync({ data });
    if (res.token) {
      setAuthToken(res.token);
      queryClient.setQueryData(getGetMeQueryKey(), res.user);
      setLocation("/bind");
    }
    return res;
  };

  const register = async (data: any) => {
    const res = await registerMutation.mutateAsync({ data });
    if (res.token) {
      setAuthToken(res.token);
      queryClient.setQueryData(getGetMeQueryKey(), res.user);
      setLocation("/bind");
    }
    return res;
  };

  const logout = async () => {
    try {
      await logoutMutation.mutateAsync({});
    } catch (e) {
      // Ignore errors on logout
    } finally {
      setAuthToken(null);
      queryClient.setQueryData(getGetMeQueryKey(), null);
      setLocation("/bind");
    }
  };

  return {
    user,
    isLoading,
    error,
    login,
    register,
    logout,
    isLoggingIn: loginMutation.isPending,
    isRegistering: registerMutation.isPending,
  };
}
