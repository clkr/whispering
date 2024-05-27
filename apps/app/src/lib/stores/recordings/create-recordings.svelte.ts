import {
	PleaseEnterAPIKeyToast,
	SomethingWentWrongToast,
	TranscriptionComplete,
	InvalidApiKey,
} from '$lib/toasts';
import { ClipboardService } from '@repo/services/services/clipboard';
import type { Recording } from '@repo/services/services/recordings-db';
import { RecordingsDbService } from '@repo/services/services/recordings-db';
import { TranscriptionError, TranscriptionService } from '@repo/services/services/transcription';
import { Effect, Option } from 'effect';
import { toast } from 'svelte-sonner';
import { settings } from '../settings.svelte';

export const createRecordings = Effect.gen(function* (_) {
	const recordingsDb = yield* _(RecordingsDbService);
	const transcriptionService = yield* _(TranscriptionService);
	const clipboardService = yield* _(ClipboardService);

	let recordings = $state<Recording[]>([]);
	const updateRecording = (recording: Recording) =>
		Effect.gen(function* (_) {
			yield* _(recordingsDb.updateRecording(recording));
			recordings = recordings.map((r) => (r.id === recording.id ? recording : r));
		});
	return {
		get value() {
			return recordings;
		},
		sync: Effect.gen(function* (_) {
			recordings = yield* _(recordingsDb.getAllRecordings);
		}).pipe(
			Effect.catchAll((error) => {
				console.error(error);
				toast.error(error.message);
				return Effect.succeed(undefined);
			}),
		),
		addRecording: (recording: Recording) =>
			Effect.gen(function* (_) {
				yield* _(recordingsDb.addRecording(recording));
				recordings.push(recording);
			}).pipe(
				Effect.catchAll((error) => {
					console.error(error);
					toast.error(error.message);
					return Effect.succeed(undefined);
				}),
			),
		updateRecording: (recording: Recording) =>
			Effect.gen(function* (_) {
				yield* _(updateRecording(recording));
				toast.success('Recording updated!');
			}).pipe(
				Effect.catchAll((error) => {
					console.error(error);
					toast.error(error.message);
					return Effect.succeed(undefined);
				}),
			),
		deleteRecording: (id: string) =>
			Effect.gen(function* (_) {
				yield* _(recordingsDb.deleteRecording(id));
				recordings = recordings.filter((recording) => recording.id !== id);
				toast.success('Recording deleted!');
			}).pipe(
				Effect.catchAll((error) => {
					console.error(error);
					toast.error(error.message);
					return Effect.succeed(undefined);
				}),
			),
		transcribeRecording: (id: string) =>
			Effect.gen(function* (_) {
				const maybeRecording = yield* _(recordingsDb.getRecording(id));
				if (Option.isNone(maybeRecording)) {
					return yield* _(new TranscriptionError({ message: `Recording with id ${id} not found` }));
				}
				const recording = yield* _(maybeRecording);
				yield* _(updateRecording({ ...recording, transcriptionStatus: 'TRANSCRIBING' }));
				const transcribedText = yield* _(transcriptionService.transcribe(recording.blob, settings));
				yield* _(updateRecording({ ...recording, transcribedText, transcriptionStatus: 'DONE' }));
				if (settings.isCopyToClipboardEnabled && transcribedText)
					yield* _(clipboardService.setClipboardText(transcribedText));
				if (settings.isPasteContentsOnSuccessEnabled && transcribedText)
					yield* _(clipboardService.pasteTextFromClipboard);
			}).pipe(
				Effect.catchAll((error) => Effect.succeed(error)),
				Effect.runPromise,
				(transcribeAndCopyPromise) => {
					toast.promise(transcribeAndCopyPromise, {
						loading: 'Transcribing recording...',
						success: (maybeError) => {
							if (!maybeError) return TranscriptionComplete;
							const error = maybeError;
							switch (error._tag) {
								case 'PleaseEnterApiKeyError':
									return PleaseEnterAPIKeyToast;
								case 'InvalidApiKeyError':
									return InvalidApiKey;
								default:
									return SomethingWentWrongToast;
							}
						},
						error: (_uncaughtError) => {
							return SomethingWentWrongToast;
						},
					});
				},
			),
		copyRecordingText: (recording: Recording) =>
			Effect.gen(function* (_) {
				if (recording.transcribedText === '') return;
				yield* _(clipboardService.setClipboardText(recording.transcribedText));
				toast.success('Copied to clipboard!');
			}).pipe(Effect.runPromise),
	};
});
