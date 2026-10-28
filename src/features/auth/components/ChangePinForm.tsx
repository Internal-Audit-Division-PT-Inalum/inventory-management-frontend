import { zodResolver } from "@hookform/resolvers/zod";
import {
	AlertCircle,
	Eye,
	EyeOff,
	KeyRound,
	Loader2,
	Lock,
} from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChangePin } from "../api/useChangePin";
import { type ChangePinFormData, changePinSchema } from "../types";

interface ChangePinFormProps {
	onSuccess?: () => void;
	isMandatory?: boolean;
}

export function ChangePinForm({
	onSuccess,
	isMandatory = false,
}: ChangePinFormProps) {
	const [showCurrentPin, setShowCurrentPin] = React.useState(false);
	const [showNewPin, setShowNewPin] = React.useState(false);
	const [showConfirmPin, setShowConfirmPin] = React.useState(false);

	const {
		register,
		handleSubmit,
		setError,
		formState: { errors },
	} = useForm<ChangePinFormData>({
		resolver: zodResolver(changePinSchema),
		defaultValues: {
			current_pin: "",
			new_pin: "",
			new_pin_confirmation: "",
		},
	});

	const changePinMutation = useChangePin({
		onSuccess: () => {
			onSuccess?.();
		},
		onError: (err) => {
			// Jika ada galat spesifik field dari backend (misal current_pin mismatch atau weak pin)
			if (err.fieldErrors) {
				if (err.fieldErrors.current_pin?.[0]) {
					setError("current_pin", {
						message: err.fieldErrors.current_pin[0],
					});
				}
				if (err.fieldErrors.new_pin?.[0]) {
					setError("new_pin", {
						message: err.fieldErrors.new_pin[0],
					});
				}
			}
		},
	});

	const onSubmit = (data: ChangePinFormData) => {
		changePinMutation.mutate({
			current_pin: data.current_pin.trim(),
			new_pin: data.new_pin.trim(),
			new_pin_confirmation: data.new_pin_confirmation.trim(),
		});
	};

	const rootError = changePinMutation.error;

	return (
		<form
			onSubmit={handleSubmit(onSubmit)}
			className="space-y-4"
			noValidate
			aria-label="Form Ganti PIN Keamanan"
		>
			{rootError && !rootError.fieldErrors && (
				<div
					role="alert"
					className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50/95 p-3.5 text-xs text-red-800 transition-all"
				>
					<AlertCircle
						className="mt-0.5 h-4 w-4 shrink-0 text-red-600"
						aria-hidden="true"
					/>
					<div className="flex-1">
						<p className="font-semibold">Gagal Mengubah PIN</p>
						<p className="mt-0.5 leading-relaxed opacity-90">
							{rootError.message ||
								"Terjadi kesalahan saat memproses perubahan PIN."}
						</p>
					</div>
				</div>
			)}

			<div className="space-y-1.5">
				<label
					htmlFor="change-current-pin"
					className="block text-xs font-semibold tracking-wider text-slate-700 uppercase"
				>
					PIN Saat Ini
				</label>
				<div className="relative">
					<div
						className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400"
						aria-hidden="true"
					>
						<Lock className="h-4 w-4" />
					</div>
					<Input
						id="change-current-pin"
						type={showCurrentPin ? "text" : "password"}
						inputMode="numeric"
						pattern="[0-9]*"
						maxLength={6}
						autoComplete="current-password"
						placeholder="••••••"
						error={Boolean(errors.current_pin)}
						className="pl-10 pr-11 font-mono tracking-widest text-base"
						{...register("current_pin")}
					/>
					<button
						type="button"
						onClick={() => setShowCurrentPin(!showCurrentPin)}
						className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 transition-colors hover:text-slate-600 focus:outline-none"
						aria-label={
							showCurrentPin
								? "Sembunyikan PIN saat ini"
								: "Tampilkan PIN saat ini"
						}
					>
						{showCurrentPin ? (
							<EyeOff className="h-4 w-4" />
						) : (
							<Eye className="h-4 w-4" />
						)}
					</button>
				</div>
				{errors.current_pin ? (
					<p
						id="current-pin-error"
						className="text-xs font-medium text-red-600"
						role="alert"
					>
						{errors.current_pin.message}
					</p>
				) : (
					<p className="text-[11px] text-slate-500">
						{isMandatory
							? "Masukkan PIN sementara yang diberikan oleh Administrator."
							: "Masukkan 6 digit PIN akun Anda yang aktif saat ini."}
					</p>
				)}
			</div>

			<div className="space-y-1.5">
				<label
					htmlFor="change-new-pin"
					className="block text-xs font-semibold tracking-wider text-slate-700 uppercase"
				>
					PIN Baru (6 Digit)
				</label>
				<div className="relative">
					<div
						className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400"
						aria-hidden="true"
					>
						<KeyRound className="h-4 w-4" />
					</div>
					<Input
						id="change-new-pin"
						type={showNewPin ? "text" : "password"}
						inputMode="numeric"
						pattern="[0-9]*"
						maxLength={6}
						autoComplete="new-password"
						placeholder="••••••"
						error={Boolean(errors.new_pin)}
						className="pl-10 pr-11 font-mono tracking-widest text-base"
						{...register("new_pin")}
					/>
					<button
						type="button"
						onClick={() => setShowNewPin(!showNewPin)}
						className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 transition-colors hover:text-slate-600 focus:outline-none"
						aria-label={
							showNewPin ? "Sembunyikan PIN baru" : "Tampilkan PIN baru"
						}
					>
						{showNewPin ? (
							<EyeOff className="h-4 w-4" />
						) : (
							<Eye className="h-4 w-4" />
						)}
					</button>
				</div>
				{errors.new_pin ? (
					<p
						id="new-pin-error"
						className="text-xs font-medium text-red-600"
						role="alert"
					>
						{errors.new_pin.message}
					</p>
				) : (
					<p className="text-[11px] text-slate-500">
						Hindari kombinasi umum seperti 123456 atau angka kembar 111111.
					</p>
				)}
			</div>

			<div className="space-y-1.5">
				<label
					htmlFor="change-confirm-pin"
					className="block text-xs font-semibold tracking-wider text-slate-700 uppercase"
				>
					Konfirmasi PIN Baru
				</label>
				<div className="relative">
					<div
						className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400"
						aria-hidden="true"
					>
						<KeyRound className="h-4 w-4" />
					</div>
					<Input
						id="change-confirm-pin"
						type={showConfirmPin ? "text" : "password"}
						inputMode="numeric"
						pattern="[0-9]*"
						maxLength={6}
						autoComplete="new-password"
						placeholder="••••••"
						error={Boolean(errors.new_pin_confirmation)}
						className="pl-10 pr-11 font-mono tracking-widest text-base"
						{...register("new_pin_confirmation")}
					/>
					<button
						type="button"
						onClick={() => setShowConfirmPin(!showConfirmPin)}
						className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 transition-colors hover:text-slate-600 focus:outline-none"
						aria-label={
							showConfirmPin
								? "Sembunyikan konfirmasi PIN"
								: "Tampilkan konfirmasi PIN"
						}
					>
						{showConfirmPin ? (
							<EyeOff className="h-4 w-4" />
						) : (
							<Eye className="h-4 w-4" />
						)}
					</button>
				</div>
				{errors.new_pin_confirmation && (
					<p
						id="confirm-pin-error"
						className="text-xs font-medium text-red-600"
						role="alert"
					>
						{errors.new_pin_confirmation.message}
					</p>
				)}
			</div>

			<Button
				type="submit"
				disabled={changePinMutation.isPending}
				className="mt-2 w-full text-base font-semibold shadow-md active:scale-[0.99]"
				size="touch"
			>
				{changePinMutation.isPending ? (
					<>
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						Menyimpan PIN Baru...
					</>
				) : (
					"Simpan PIN Keamanan"
				)}
			</Button>
		</form>
	);
}
