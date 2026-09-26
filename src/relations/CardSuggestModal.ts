import { App, FuzzyMatch, FuzzySuggestModal } from 'obsidian';
import { c } from 'src/components/helpers';

export interface CardChoice {
  title: string;
  /** Secondary text, e.g. the list the card is in. */
  note?: string;
  onChoose: () => void;
}

/** Fuzzy picker over cards, used to create and remove relations. */
export class CardSuggestModal extends FuzzySuggestModal<CardChoice> {
  constructor(
    app: App,
    private choices: CardChoice[],
    placeholder: string
  ) {
    super(app);
    this.setPlaceholder(placeholder);
    this.modalEl.addClass(c('card-suggest-modal'));
  }

  getItems() {
    return this.choices;
  }

  getItemText(choice: CardChoice) {
    return choice.note ? `${choice.title} ${choice.note}` : choice.title;
  }

  renderSuggestion(match: FuzzyMatch<CardChoice>, el: HTMLElement) {
    el.createDiv({ cls: c('card-suggest-title'), text: match.item.title });
    if (match.item.note) {
      el.createDiv({ cls: c('card-suggest-note'), text: match.item.note });
    }
  }

  onChooseItem(choice: CardChoice) {
    choice.onChoose();
  }
}
