import { NotificationService, WHISPERING_URL, WhisperingError } from '@repo/shared';
import { Console, Effect, Layer } from 'effect';
import { nanoid } from 'nanoid/non-secure';
import studioMicrophone from 'data-base64:~assets/studio_microphone.png';
import { getOrCreateWhisperingTabId } from '~lib/background/contents/getOrCreateWhisperingTabId';

export const NotificationServiceBgswLive = Layer.succeed(
	NotificationService,
	NotificationService.of({
		notify: ({ id: maybeId, title, description, action }) =>
			Effect.gen(function* () {
				const id = maybeId ?? nanoid();

				yield* Effect.tryPromise({
					try: async () => {
						if (!action) {
							chrome.notifications.create(id, {
								priority: 2,
								requireInteraction: true,
								title,
								message: description,
								type: 'basic',
								iconUrl: studioMicrophone,
							});
						} else {
							chrome.notifications.create(id, {
								priority: 2,
								title,
								message: description,
								type: 'basic',
								buttons: [{ title: action.label }],
								iconUrl: studioMicrophone,
							});
							chrome.notifications.onButtonClicked.addListener((id, buttonIndex) =>
								Effect.gen(function* () {
									if (buttonIndex === 0) {
										chrome.notifications.clear(id);
										const whisperingTabId = yield* getOrCreateWhisperingTabId;
										yield* Effect.promise(() =>
											chrome.tabs.update(whisperingTabId, {
												active: true,
												url: `${WHISPERING_URL}${action.goto}`,
											}),
										);
									}
								}).pipe(Effect.runPromise),
							);
						}
					},
					catch: (error) =>
						new WhisperingError({
							title: 'Failed to show notification',
							description: error instanceof Error ? error.message : `Unknown error: ${error}`,
							error,
						}),
				}).pipe(
					Effect.tapError((error) => Console.error({ ...error })),
					Effect.catchAll(() => Effect.succeed(maybeId ?? nanoid())),
				);

				return id;
			}),
		clear: (id: string) => Effect.sync(() => chrome.notifications.clear(id)),
	}),
);
