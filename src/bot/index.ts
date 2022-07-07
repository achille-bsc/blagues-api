import {
  ActivityType,
  AnyInteraction,
  Client,
  GuildMember,
  GuildTextBasedChannel,
  IntentsBitField,
  InteractionType,
  Message,
  PartialGuildMember,
  PartialMessage,
  Partials
} from 'discord.js';
import Jokes from '../jokes';
import prisma from '../prisma';
import { correctionsChannelId, suggestionsChannelId, guildId, godfatherRoleId } from './constants';
import { updateGodfatherEmoji } from './modules/godfathers';
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
      intents:
        IntentsBitField.Flags.Guilds |
        IntentsBitField.Flags.GuildMembers |
        IntentsBitField.Flags.GuildMessages |
        IntentsBitField.Flags.MessageContent
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
    await this.stickys.reload();

    this.registerEvents();

    this.refreshStatus();
  }

  async onInteractionCreate(interaction: AnyInteraction): Promise<void> {
    if (interaction.type === InteractionType.ApplicationCommand) {
      return this.dispatcher.execute(interaction);
    } else if (interaction.isButton() && interaction.customId === 'user_reminder') {
      return this.reminders.pendingUserReminders(interaction);
    }
  }

  async onMessageDelete(message: Message | PartialMessage): Promise<void> {
    if (!message.inGuild()) return;
    if (message.author && message.author.id !== this.user!.id) return;
    if (![correctionsChannelId, suggestionsChannelId].includes(message.channelId)) return;
    if (!message.embeds[0]?.author) return;

    const proposal = await prisma.proposal.findUnique({
      where: { message_id: message.id },
      include: {
        corrections: suggestionsChannelId === message.channelId
      }
    });

    if (!proposal) return;

    await prisma.proposal.delete({
      where: {
        id: proposal.id
      }
    });

    if (proposal.corrections?.length) {
      const correctionsChannel = message.guild.channels.resolve(correctionsChannelId) as GuildTextBasedChannel;
      for (const correction of proposal.corrections) {
        try {
          const fetchedMessage = await correctionsChannel.messages.fetch(correction.message_id!);
          if (fetchedMessage.deletable) await fetchedMessage.delete();
        } catch {
          continue;
        }
      }
    }
  }

  async onMessageCreate(message: Message | PartialMessage): Promise<void> {
    if (!message.inGuild()) return;
    this.stickys.run(message);
  }

  async onGuildMemberUpdate(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) {
    if (newMember.guild.id !== guildId) return;
    if ((oldMember.avatar ?? oldMember.user.avatar) === (newMember.avatar ?? newMember.user.avatar)) return;
    if (!newMember.roles.cache.has(godfatherRoleId)) return;
    await updateGodfatherEmoji(newMember);
  }

  registerEvents(): void {
    this.on('interactionCreate', this.onInteractionCreate.bind(this));
    this.on('messageDelete', this.onMessageDelete.bind(this));
    this.on('messageCreate', this.onMessageCreate.bind(this));
    this.on('guildMemberUpdate', this.onGuildMemberUpdate.bind(this));
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
