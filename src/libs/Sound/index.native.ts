import attentionSound from '@assets/sounds/attention.mp3';
import doneSound from '@assets/sounds/done.mp3';
import receiveSound from '@assets/sounds/receive.mp3';
import successSound from '@assets/sounds/success.mp3';

import Log from '@libs/Log';
import Visibility from '@libs/Visibility';

import type {AudioSource} from 'expo-audio';
import type {ValueOf} from 'type-fest';

import {createAudioPlayer, setAudioModeAsync} from 'expo-audio';

import {getIsMuted, SOUNDS, withMinimalExecutionTime} from './BaseSound';

// Longest sound (success.mp3) is 1.56s
const RELEASE_TIMEOUT = 5000;

// Sound assets are statically imported for bundling.
const SOUND_ASSETS = {
    [SOUNDS.DONE]: doneSound,
    [SOUNDS.SUCCESS]: successSound,
    [SOUNDS.ATTENTION]: attentionSound,
    [SOUNDS.RECEIVE]: receiveSound,
} satisfies Record<ValueOf<typeof SOUNDS>, Extract<AudioSource, number | string>>;

// Configure audio mode for in-app notification sounds:
// - playsInSilentMode: false — respect the device's silent/mute switch (iOS)
// - shouldPlayInBackground: false — push notification sounds are played by the system
// - interruptionMode: 'mixWithOthers' — don't interrupt other audio (e.g. music)
const audioModeConfigured = setAudioModeAsync({playsInSilentMode: false, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers'});

const playSound = async (soundFile: ValueOf<typeof SOUNDS>) => {
    if (getIsMuted()) {
        return;
    }

    const source = SOUND_ASSETS[soundFile];
    if (!source) {
        return;
    }

    // Wait for audio mode to be configured before playing to ensure the session
    // uses the .ambient category (which won't interrupt music or other audio)
    await audioModeConfigured;

    // The app may have moved to the background while the sound waited in the queue
    if (!Visibility.isVisible()) {
        return;
    }

    const player = createAudioPlayer(source);

    const release = () => {
        subscription.remove();
        player.remove();
    };

    // Listen for playback completion to release resources
    const subscription = player.addListener('playbackStatusUpdate', (status) => {
        if (!status.didJustFinish) {
            return;
        }

        release();
    });

    // Playback does not always start (Android skips play() in silent mode), so completion can't be the only way to release
    setTimeout(release, RELEASE_TIMEOUT);

    try {
        player.play();
    } catch (error) {
        // iOS throws when it refuses to activate the audio session
        release();
        Log.hmmm('[sound] Play error:', {message: error instanceof Error ? error.message : String(error)});
    }
};

function clearSoundAssetsCache() {}

export {SOUNDS, clearSoundAssetsCache};
export default withMinimalExecutionTime(playSound, 300);
