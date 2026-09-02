import {
    AIRelateAsyncReply,
    IntroductionTab,
    Module,
    ModuleType,
    RelateCard,
    RelateCardType,
    RelatesFeedReply,
    ViewReply,
} from '@proto/bilibili/app/viewunite/v1/view';
import {
    ViewReply as IpadViewReply,
    RelatesFeedReply as IpadRelatesFeedReply,
} from '@proto/bilibili/app/view/v1/view';

// Deliberately exclude PlayView, ViewProgress, DmView and all request rewrites.
export const videoAdPaths = new Set([
    '/bilibili.app.viewunite.v1.View/View',
    '/bilibili.app.viewunite.v1.View/RelatesFeed',
    '/bilibili.app.viewunite.v1.View/AIRelateAsync',
    '/bilibili.app.view.v1.View/View',
    '/bilibili.app.view.v1.View/RelatesFeed',
]);

export function filterVideoAds(path: string, body: Uint8Array): Uint8Array | undefined {
    let changed = false;
    const removeAds = <T>(items: T[], isAd: (item: T) => boolean): T[] => {
        const kept = items.filter(item => !isAd(item));
        changed ||= kept.length !== items.length;
        return kept;
    };
    const cleanCards = (cards: RelateCard[]) =>
        removeAds(cards, card => card.relateCardType === RelateCardType.CM_TYPE || card.cmStock.length > 0);
    const cleanModules = (modules: Module[]) => {
        const kept = removeAds(modules, module => module.type === ModuleType.MERCHANDISE);
        for (const module of kept) {
            if (module.data.oneofKind === 'relates') {
                module.data.relates.cards = cleanCards(module.data.relates.cards);
            }
        }
        return kept;
    };
    const cleanIntroduction = (tab: IntroductionTab) => {
        tab.modules = cleanModules(tab.modules);
    };

    switch (path) {
        case '/bilibili.app.viewunite.v1.View/View': {
            const message = ViewReply.fromBinary(body);
            if (message.cm !== undefined) {
                message.cm = undefined;
                changed = true;
            }
            for (const tab of message.tab?.tabModule ?? []) {
                if (tab.tab.oneofKind === 'introduction') cleanIntroduction(tab.tab.introduction);
            }
            return changed ? ViewReply.toBinary(message) : undefined;
        }
        case '/bilibili.app.viewunite.v1.View/RelatesFeed': {
            const message = RelatesFeedReply.fromBinary(body);
            message.relates = cleanCards(message.relates);
            return changed ? RelatesFeedReply.toBinary(message) : undefined;
        }
        case '/bilibili.app.viewunite.v1.View/AIRelateAsync': {
            const message = AIRelateAsyncReply.fromBinary(body);
            if (message.cm !== undefined) {
                message.cm = undefined;
                changed = true;
            }
            if (message.module) message.module.modules = cleanModules(message.module.modules);
            return changed ? AIRelateAsyncReply.toBinary(message) : undefined;
        }
        case '/bilibili.app.view.v1.View/View': {
            const message = IpadViewReply.fromBinary(body);
            if (message.cms.length || message.cmConfig !== undefined || message.cmIpad !== undefined) {
                message.cms = [];
                message.cmConfig = undefined;
                message.cmIpad = undefined;
                changed = true;
            }
            message.relates = removeAds(message.relates, card => card.cm.length > 0);
            return changed ? IpadViewReply.toBinary(message) : undefined;
        }
        case '/bilibili.app.view.v1.View/RelatesFeed': {
            const message = IpadRelatesFeedReply.fromBinary(body);
            message.list = removeAds(message.list, card => card.cm.length > 0);
            return changed ? IpadRelatesFeedReply.toBinary(message) : undefined;
        }
    }
}
