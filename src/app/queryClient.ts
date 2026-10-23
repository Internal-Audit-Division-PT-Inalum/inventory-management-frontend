import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 1000 * 30, // 30 detik
			gcTime: 1000 * 60 * 15, // 15 menit
			retry: 1,
			refetchOnWindowFocus: true,
		},
	},
});
