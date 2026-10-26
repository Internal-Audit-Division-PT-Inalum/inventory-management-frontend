import { zodResolver } from "@hookform/resolvers/zod";
import {
	AlertCircle,
	Eye,
	EyeOff,
	Loader2,
	Lock,
	ShieldAlert,
	User,
} from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AuthSession } from "@/types/api";
import { useLogin } from "../api/useLogin";
import { type LoginFormData, loginSchema } from "../types";

interface LoginFormProps {
	onSuccess?: (session: AuthSession) => void;
	initialNamecode?: string;
}

export function LoginForm({ onSuccess, initialNamecode = "" }: LoginFormProps) {
	const [showPin, setShowPin] = React.useState(false);

	const {
		register,
		handleSubmit,
		setValue,
		formState: { errors },
	} = useForm<LoginFormData>({
		resolver: zodResolver(loginSchema),
		defaultValues: {
			namecode: initialNamecode.toUpperCase(),
			pin: "",
		},
	});

	const loginMutation = useLogin({
		onSuccess: (session) => {
			onSuccess?.(session);
		},
	});

	const onSubmit = (data: LoginFormData) => {
		loginMutation.mutate({
			namecode: data.namecode.trim().toUpperCase(),
			pin: data.pin.trim(),
		});
	};

	const error = loginMutation.error;
	const isLocked =
		error?.code === "ACCOUNT_LOCKED" ||
		error?.status === 429 ||
		error?.message?.toLowerCase().includes("terkunci");

	return (
		<form
			onSubmit={handleSubmit(onSubmit)}
			className="space-y-5"
			noValidate
			aria-label="Form Login Pegawai"
		>
			{/* Error Banner */}
			{error && (
				<div
					role="alert"
					className={`flex items-start gap-3 rounded-xl border p-4 text-sm transition-all ${
						isLocked
							? "border-amber-300 bg-amber-50/90 text-amber-900"
							: "border-red-200 bg-red-50/90 text-red-800"
					}`}
				>
					{isLocked ? (
						<ShieldAlert
							className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
							aria-hidden="true"
						/>
					) : (
						<AlertCircle
							className="mt-0.5 h-5 w-5 shrink-0 text-red-600"
							aria-hidden="true"
						/>
					)}
					<div className="flex-1 space-y-1">
						<p className="font-semibold">
							{isLocked ? "Akun Terkunci Sementara" : "Gagal Masuk"}
						</p>
						<p className="text-xs leading-relaxed opacity-90">
							{isLocked
								? "Terlalu banyak percobaan PIN yang salah. Akun Anda dikunci sementara selama 15 menit demi keamanan. Hubungi Administrator jika butuh bantuan."
								: error.message ||
									"Namecode atau PIN salah. Silakan periksa kembali."}
						</p>
					</div>
				</div>
			)}

			{/* Field: Namecode */}
			<div className="space-y-1.5">
				<label
					htmlFor="login-namecode"
					className="block text-xs font-semibold tracking-wider text-slate-700 uppercase"
				>
					Namecode Pegawai
				</label>
				<div className="relative">
					<div
						className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400"
						aria-hidden="true"
					>
						<User className="h-4 w-4" />
					</div>
					<Input
						id="login-namecode"
						type="text"
						autoComplete="username"
						autoCapitalize="characters"
						autoCorrect="off"
						spellCheck={false}
						maxLength={10}
						placeholder="Misal: MHS"
						error={Boolean(errors.namecode)}
						className="pl-10 font-mono tracking-wider uppercase placeholder:normal-case placeholder:font-sans placeholder:tracking-normal"
						{...register("namecode", {
							onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
								setValue("namecode", e.target.value.toUpperCase(), {
									shouldValidate: true,
								});
							},
						})}
					/>
				</div>
				{errors.namecode ? (
					<p
						id="namecode-error"
						className="text-xs font-medium text-red-600"
						role="alert"
					>
						{errors.namecode.message}
					</p>
				) : (
					<p className="text-[11px] text-slate-500">
						Inisial 2–10 karakter huruf/angka pegawai Anda.
					</p>
				)}
			</div>

			{/* Field: 6-Digit PIN */}
			<div className="space-y-1.5">
				<div className="flex items-center justify-between">
					<label
						htmlFor="login-pin"
						className="block text-xs font-semibold tracking-wider text-slate-700 uppercase"
					>
						6-Digit PIN
					</label>
					<span className="text-[11px] text-slate-400">Numerik</span>
				</div>
				<div className="relative">
					<div
						className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400"
						aria-hidden="true"
					>
						<Lock className="h-4 w-4" />
					</div>
					<Input
						id="login-pin"
						type={showPin ? "text" : "password"}
						inputMode="numeric"
						pattern="[0-9]*"
						maxLength={6}
						autoComplete="current-password"
						placeholder="••••••"
						error={Boolean(errors.pin)}
						className="pl-10 pr-11 font-mono tracking-widest text-base"
						{...register("pin")}
					/>
					<button
						type="button"
						onClick={() => setShowPin(!showPin)}
						className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 transition-colors hover:text-slate-600 focus:outline-none"
						aria-label={showPin ? "Sembunyikan PIN" : "Tampilkan PIN"}
					>
						{showPin ? (
							<EyeOff className="h-4 w-4" />
						) : (
							<Eye className="h-4 w-4" />
						)}
					</button>
				</div>
				{errors.pin ? (
					<p
						id="pin-error"
						className="text-xs font-medium text-red-600"
						role="alert"
					>
						{errors.pin.message}
					</p>
				) : (
					<p className="text-[11px] text-slate-500">
						Masukkan 6 digit angka PIN keamanan Anda.
					</p>
				)}
			</div>

			{/* Action: Submit Button */}
			<Button
				type="submit"
				disabled={loginMutation.isPending}
				className="w-full text-base font-semibold shadow-md active:scale-[0.99]"
				size="touch"
			>
				{loginMutation.isPending ? (
					<>
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						Memverifikasi...
					</>
				) : (
					"Masuk ke Sistem"
				)}
			</Button>
		</form>
	);
}
