import {
  ActivityType,
  AnyInteraction,
  Client,
  IntentsBitField,
  InteractionType,
  Message,
  PartialMessage,
  Partials
} from 'discord.js';
import Jokes from '../jokes';
import prisma from '../prisma';
import { correctionsChannel, suggestionsChannel } from './constants';
import Dispatcher from './lib/dispatcher';
import Reminders from './modules/reminders';
import Stickys from './modules/stickys';

export default class Bot extends Client {
  public dispatcher: Dispatcher;
  public stickys: Stickys;
  public reminders: Reminders;

  constructor() {
    super({
      partials: [Partials.Reaction],
      intents: IntentsBitField.Flags.Guilds | IntentsBitField.Flags.GuildMembers | IntentsBitField.Flags.GuildMessages
    });

    this.dispatcher = new Dispatcher(this);
    this.stickys = new Stickys(this);
    this.reminders = new Reminders(this);

    this.once('ready', this.onReady.bind(this));
  }

  get available(): boolean {
    return !!this.readyAt;
  }

  async onReady(): Promise<void> {
    console.log(`${this.user!.tag} connecté !`);

    await this.dispatcher.register();

    this.registerEvents();

    this.refreshStatus();
  }

  async onInteractionCreate(interaction: AnyInteraction): Promise<void> {
    if (interaction.type === InteractionType.ApplicationCommand) {
      return this.dispatcher.execute(interaction);
    }
  }

  async onMessageDelete(message: Message | PartialMessage): Promise<void> {
    if (message.author && message.author.id !== this.user!.id) return;
    if (![correctionsChannel, suggestionsChannel].includes(message.channelId)) return;
    if (!message.embeds[0]?.author) return;

    await prisma.proposal.delete({ where: { message_id: message.id } });
  }

  registerEvents(): void {
    this.on('interactionCreate', this.onInteractionCreate.bind(this));
    this.on('messageDelete', this.onMessageDelete.bind(this));
  }

  refreshStatus() {
    this.user!.setActivity(`les ${Jokes.count} blagues`, {
      type: ActivityType.Watching
    });
  }

  async start(): Promise<void> {
    if (process.env.bot_service !== 'true') {
      return console.log('Bot service désactivé');
    }
    if (!process.env.BOT_TOKEN) {
      return console.log("Bot non lancé car aucun token n'a été défini");
    }
    await this.login(process.env.BOT_TOKEN);
  }
}

declare module 'discord.js' {
  interface Client {
    dispatcher: Dispatcher;
    stickys: Stickys;
    refreshStatus(): void;
  }
}
